import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('RoutingSource.toDisplayString', () {
    test('muxed variant formats as muxed address display string', () {
      expect(
        RoutingSource.muxed.toDisplayString(),
        equals('Routed via muxed address (M-address)'),
      );
    });

    test('memo variant formats as memo ID display string', () {
      expect(
        RoutingSource.memo.toDisplayString(),
        equals('Routed via memo ID'),
      );
    });

    test('none variant formats as no routing source display string', () {
      expect(
        RoutingSource.none.toDisplayString(),
        equals('No routing source detected'),
      );
    });
  });

  group('RoutingResult.toDisplayString', () {
    test('muxed source formats with routing ID and base account', () {
      final result = RoutingResult(
        routingSource: RoutingSource.muxed,
        routingId: '12345',
        destinationBaseAccount: 'GABC123',
        warnings: [],
      );
      expect(
        result.toDisplayString(),
        equals('Muxed routing: ID 12345 -> GABC123'),
      );
    });

    test('muxed source handles null values gracefully', () {
      final result = RoutingResult(
        routingSource: RoutingSource.muxed,
        warnings: [],
      );
      expect(
        result.toDisplayString(),
        equals('Muxed routing: ID unknown -> unknown'),
      );
    });

    test('memo source formats with routing ID', () {
      final result = RoutingResult(
        routingSource: RoutingSource.memo,
        routingId: '99999',
        warnings: [],
      );
      expect(
        result.toDisplayString(),
        equals('Memo routing: ID 99999'),
      );
    });

    test('none source formats as no routing', () {
      final result = RoutingResult(
        routingSource: RoutingSource.none,
        warnings: [],
      );
      expect(
        result.toDisplayString(),
        equals('No routing detected'),
      );
    });
  });
}
