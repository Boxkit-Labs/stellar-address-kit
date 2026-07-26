import 'package:flutter_test/flutter_test.dart';
import 'package:stellar_address_kit_demo/features/analyze/domain/usecases/analyze_address.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('AnalyzeAddress UseCase', () {
    final useCase = AnalyzeAddress();

    test('should identify M-address and source correctly', () {
      const muxed = 'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAABQHEJF6';
      final result = useCase(address: muxed);
      
      expect(result.addressKind, 'M');
      expect(result.routingSource, RoutingSource.muxed);
      expect(result.routingId, BigInt.from(12345));
    });

    test('should identify G-address with Memo ID', () {
      const gAddr = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      final result = useCase(address: gAddr, memoType: 'id', memoValue: '555');
      
      expect(result.addressKind, 'G');
      expect(result.routingSource, RoutingSource.memo);
      expect(result.routingId, BigInt.from(555));
    });

    test('should identify C-address as invalid destination', () {
      const cAddr = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      final result = useCase(address: cAddr);
      
      expect(result.addressKind, 'C');
      expect(result.warnings.any((w) => w.code == 'INVALID_DESTINATION'), true);
    });
  });
}
