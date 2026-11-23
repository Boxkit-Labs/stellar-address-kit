import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

/// Cross-platform conformance checks that sit on top of spec_runner_test.dart.
///
/// spec_runner_test.dart replays every vector; this file guards what a replay
/// cannot notice on its own: that no vector module is silently skipped, that
/// the 2^53+1 canary survives, and that the canonicalization invariants hold
/// for every routing result. It mirrors
/// packages/core-ts/src/spec/conformance.test.ts and
/// packages/core-go/spec/conformance_test.go.

const knownModules = <String>[
  'detect',
  'muxed_encode',
  'muxed_decode',
  'extract_routing',
];

const canary = '9007199254740993'; // 2^53 + 1
const maxUint64 = '18446744073709551615';

const validG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

final canonicalRoutingId = RegExp(r'^(0|[1-9][0-9]*)$');
final numericIdInJson = RegExp(r'"(id|routingId)"\s*:\s*-?\d');

RoutingInput routingInput(
  String destination, {
  String memoType = 'none',
  String? memoValue,
}) {
  return RoutingInput(
    destination: destination,
    memoType: memoType,
    memoValue: memoValue,
    sourceAccount: null,
  );
}

void main() {
  final file = File('../../spec/vectors.json');
  if (!file.existsSync()) {
    fail('Expected spec/vectors.json but file was not found.');
  }

  final String raw = file.readAsStringSync();
  final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
  final List<Map<String, dynamic>> cases =
      (json['cases'] as List<dynamic>).cast<Map<String, dynamic>>();

  group('spec vectors: coverage', () {
    test('every vector uses a module the harness can run', () {
      final unknown = cases
          .map((c) => c['module'])
          .where((m) => !knownModules.contains(m))
          .toList();
      expect(unknown, isEmpty);
    });

    test('every known module has at least one vector', () {
      for (final module in knownModules) {
        expect(cases.any((c) => c['module'] == module), isTrue,
            reason: 'no vector for module $module');
      }
    });

    test('the suite covers positive, negative and edge-case vectors', () {
      final tags = cases
          .expand((c) => (c['tags'] as List<dynamic>? ?? const []))
          .map((t) => t.toString())
          .toSet();
      for (final tag in ['positive', 'negative', 'edge']) {
        expect(tags.contains(tag), isTrue, reason: 'no vector tagged $tag');
      }
    });

    test('writes every 64-bit id as a JSON string, never a number', () {
      expect(numericIdInJson.hasMatch(raw), isFalse);
    });
  });

  group('2^53+1 canary (id 9007199254740993)', () {
    test('is present in the encode, decode and routing vectors', () {
      final modules = cases
          .where((c) => jsonEncode(c).contains('"$canary"'))
          .map((c) => c['module'])
          .toSet();
      expect(modules,
          containsAll(['muxed_encode', 'muxed_decode', 'extract_routing']));
    });

    test('encodes and decodes without precision loss', () {
      final id = BigInt.parse(canary);
      final encoded = MuxedAddress.encode(baseG: validG, id: id);
      final decoded = MuxedAddress.decode(encoded);
      expect(decoded.id, id);
      expect(decoded.id.toString(), canary);
      expect(decoded.baseG, validG);
    });

    test('keeps the canary distinct from its float64 neighbour', () {
      final id = BigInt.parse(canary);
      final canaryAddress = MuxedAddress.encode(baseG: validG, id: id);
      final neighbourAddress =
          MuxedAddress.encode(baseG: validG, id: id - BigInt.one);
      expect(canaryAddress, isNot(neighbourAddress));
      expect(MuxedAddress.decode(neighbourAddress).id.toString(),
          '9007199254740992');
    });

    test('round-trips the largest uint64', () {
      final id = BigInt.parse(maxUint64);
      final encoded = MuxedAddress.encode(baseG: validG, id: id);
      expect(MuxedAddress.decode(encoded).id.toString(), maxUint64);
    });

    test('returns the canary as an exact decimal string from a MEMO_ID',
        () async {
      final result = await extractRouting(
          routingInput(validG, memoType: 'id', memoValue: canary));
      expect(result.idString, canary);
      expect(result.source, RoutingSource.memo);
      expect(result.warnings, isEmpty);
    });

    test('returns the canary as an exact decimal string from a muxed address',
        () async {
      final muxed =
          MuxedAddress.encode(baseG: validG, id: BigInt.parse(canary));
      final result = await extractRouting(routingInput(muxed));
      expect(result.idString, canary);
      expect(result.source, RoutingSource.muxed);
    });
  });

  group('canonicalization invariants', () {
    test('hold for every routing vector', () async {
      var checked = 0;
      for (final c in cases.where((c) => c['module'] == 'extract_routing')) {
        final expected = c['expected'] as Map<String, dynamic>;
        final base = expected['destinationBaseAccount'];
        if (base != null) {
          expect(base.toString(), base.toString().toUpperCase(),
              reason: c['description'].toString());
        }
        final routingId = expected['routingId'];
        if (routingId != null) {
          expect(routingId, isA<String>(), reason: c['description'].toString());
          expect(canonicalRoutingId.hasMatch(routingId.toString()), isTrue,
              reason: c['description'].toString());
        }
        checked++;
      }
      expect(checked, greaterThan(0));
    });

    test('strips leading zeros and warns', () async {
      final result = await extractRouting(
          routingInput(validG, memoType: 'id', memoValue: '0007'));
      expect(result.idString, '7');
      expect(result.warnings.map((w) => w.code),
          contains('NON_CANONICAL_ROUTING_ID'));
    });

    test("keeps a lone zero as '0' without a leading-zero warning", () async {
      final result = await extractRouting(
          routingInput(validG, memoType: 'id', memoValue: '0'));
      expect(result.idString, '0');
      expect(result.warnings.map((w) => w.code),
          isNot(contains('NON_CANONICAL_ROUTING_ID')));
    });

    test('returns an uppercase base account for a lowercase destination',
        () async {
      final result = await extractRouting(routingInput(validG.toLowerCase()));
      expect(result.destinationBaseAccount, validG);
    });

    test('the low-level encoder rejects a G address with a trailing character',
        () {
      expect(() => MuxedEncoder.encodeMuxed('$validG!', BigInt.one),
          throwsA(isA<FormatException>()));
      expect(MuxedEncoder.encodeMuxed(validG, BigInt.one), isA<String>());
    });
  });
}
