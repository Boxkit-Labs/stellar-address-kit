import '../address/parse.dart';
import '../address/codes.dart';
import '../muxed/decode.dart';
import 'result.dart';
import 'memo.dart';

({String? routingId, String routingSource}) _resolveMemoRouting(
  RoutingInput input,
  List<Warning> warnings,
) {
  String? routingId;
  String routingSource = 'none';
RoutingResult extractRouting(RoutingInput input) {
  final parsed = parse(input.destination);

  if (parsed.kind == null) {
    return RoutingResult(
      routingSource: RoutingSource.none,
      warnings: [],
      destinationError: DestinationError(
        code: parsed.error!.code,
        message: parsed.error!.message,
      ),
    );
  }

  if (parsed.kind == AddressKind.c) {
    return RoutingResult(
      routingSource: RoutingSource.none,
      warnings: [
        Warning(
          code: WarningCode.invalidDestination,
          severity: 'error',
          message: 'C address is not a valid destination',
          context: WarningContext(destinationKind: 'C'),
        ),
      ],
    );
  }

  if (parsed.kind == AddressKind.m) {
    final warnings = List<Warning>.from(parsed.warnings);

    if (input.memoType == 'id' ||
        (input.memoType == 'text' &&
            input.memoValue != null &&
            RegExp(r'^\d+$').hasMatch(input.memoValue!))) {
      warnings.add(
        Warning(
          code: WarningCode.memoPresentWithMuxed,
          severity: 'warn',
          message:
              'Routing ID found in both M-address and Memo. M-address ID takes precedence.',
        ),
      );
    } else if (input.memoType != 'none') {
      warnings.add(
        Warning(
          code: WarningCode.memoIgnoredForMuxed,
          severity: 'info',
          message:
              'Memo present with M-address. Any potential routing ID in memo is ignored.',
        ),
      );
    }

    // Placeholder for actual M-address decoding logic
    // We'll implement the full decoding in the next step to pass vectors.
    return RoutingResult(
      destinationBaseAccount: 'PLACEHOLDER_G_ADDRESS', // To be implemented
      routingId: 'PLACEHOLDER_ID', // To be implemented
      routingSource: RoutingSource.muxed,
      warnings: warnings,
    );
  }

  // G-address branch
  String? routingId;
  RoutingSource routingSource = RoutingSource.none;
  final warnings = List<Warning>.from(parsed.warnings);

  if (input.memoType == 'id') {
    // Strict MEMO_ID branch: parse as BigInt, reject invalid padding
    final raw = input.memoValue ?? '';
    final norm = normalizeMemoId(raw);
    if (norm.normalized != null) {
      routingId = norm.normalized;
      routingSource = RoutingSource.memo;
    } else {
      warnings.add(
        Warning(
          code: WarningCode.memoIdInvalidFormat,
          severity: 'warn',
          message: 'MEMO_ID was empty, non-numeric, or exceeded uint64 max.',
        ),
      );
    }
    warnings.addAll(norm.warnings);
  } else if (input.memoType == 'text' && input.memoValue != null) {
    final norm = normalizeMemoTextId(input.memoValue!);
    if (norm.normalized != null) {
      routingId = norm.normalized;
      routingSource = RoutingSource.memo;
      warnings.addAll(norm.warnings);
    } else {
      warnings.add(
        Warning(
          code: WarningCode.memoTextUnroutable,
          severity: 'warn',
          message: 'MEMO_TEXT was not a valid numeric uint64.',
        ),
      );
    }
  } else if (input.memoType == 'hash' || input.memoType == 'return') {
    warnings.add(
      Warning(
        code: WarningCode.unsupportedMemoType,
        severity: 'warn',
        message: 'Memo type ${input.memoType} is not supported for routing.',
        context: WarningContext(memoType: input.memoType),
      ),
    );
  } else if (input.memoType != 'none') {
    warnings.add(
      Warning(
        code: WarningCode.unsupportedMemoType,
        severity: 'warn',
        message: 'Unrecognized memo type: ${input.memoType}',
        context: WarningContext(memoType: 'unknown'),
      ),
    );
  }

  return (routingId: routingId, routingSource: routingSource);
}

RoutingResult extractRouting(RoutingInput input) {
  final parsed = parse(input.destination);

  if (parsed.kind == null) {
    return RoutingResult(
      routingSource: 'none',
      warnings: [],
      destinationError: DestinationError(
        code: parsed.error!.code,
        message: parsed.error!.message,
      ),
    );
  }

  if (parsed.kind == AddressKind.c) {
    return RoutingResult(
      routingSource: 'none',
      warnings: [
        Warning(
          code: WarningCode.invalidDestination,
          severity: 'error',
          message: 'C address is not a valid destination',
          context: WarningContext(destinationKind: 'C'),
        ),
      ],
    );
  }

  if (parsed.kind == AddressKind.m) {
    final warnings = List<Warning>.from(parsed.warnings);
    final decoded = MuxedDecoder.decodeMuxedString(parsed.address);
    final baseG = decoded['baseG'] as String;
    final muxedId = (decoded['id'] as BigInt).toString();

    if (input.memoType != 'none') {
      warnings.add(
        Warning(
          code: WarningCode.memoIgnoredForMuxed,
          severity: 'info',
          message:
              'Memo present with M-address. M-address routing ID is ignored in favor of the provided memo.',
        ),
      );
      final memoRouting = _resolveMemoRouting(input, warnings);
      return RoutingResult(
        destinationBaseAccount: baseG,
        routingId: memoRouting.routingId,
        routingSource: memoRouting.routingSource,
        warnings: warnings,
      );
    }

    return RoutingResult(
      destinationBaseAccount: baseG,
      routingId: muxedId,
      routingSource: 'muxed',
      warnings: warnings,
    );
  }

  final warnings = List<Warning>.from(parsed.warnings);
  final memoRouting = _resolveMemoRouting(input, warnings);

  return RoutingResult(
    destinationBaseAccount: parsed.address,
    routingId: memoRouting.routingId,
    routingSource: memoRouting.routingSource,
    warnings: warnings,
  );
}
