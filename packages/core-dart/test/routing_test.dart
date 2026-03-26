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
}
