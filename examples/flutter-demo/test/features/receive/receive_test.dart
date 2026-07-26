import 'package:flutter_test/flutter_test.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:stellar_address_kit_demo/features/receive/domain/usecases/generate_deposit_instruction.dart';
import 'package:stellar_address_kit_demo/features/receive/presentation/bloc/receive_bloc.dart';

void main() {
  const testAddress = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

  group('GenerateDepositInstruction UseCase', () {
    final useCase = GenerateDepositInstruction();

    test('should generate correctly for 2^53 (JS limit)', () {
      final id = BigInt.from(9007199254740992);
      final result = useCase(baseAddress: testAddress, idString: id.toString());
      expect(result.id, id);
      expect(result.muxedAddress.startsWith('M'), true);
    });

    test('should generate correctly for 2^64-1 (uint64 max)', () {
      final id = BigInt.parse('18446744073709551615');
      final result = useCase(baseAddress: testAddress, idString: id.toString());
      expect(result.id, id);
    });
  });

  group('ReceiveBloc', () {
    late GenerateDepositInstruction useCase;

    setUp(() {
      useCase = GenerateDepositInstruction();
    });

    blocTest<ReceiveBloc, ReceiveState>(
      'emits [ReceiveSuccess] when fields change with valid data',
      build: () => ReceiveBloc(generateUseCase: useCase),
      act: (bloc) => bloc.add(const ReceiveFieldsChanged(
        baseAddress: testAddress,
        id: '123',
      )),
      expect: () => [
        isA<ReceiveSuccess>(),
      ],
    );

    blocTest<ReceiveBloc, ReceiveState>(
      'emits [ReceiveInitial] when fields are cleared',
      build: () => ReceiveBloc(generateUseCase: useCase),
      act: (bloc) => bloc.add(const ReceiveFieldsChanged(
        baseAddress: '',
        id: '',
      )),
      expect: () => [
        ReceiveInitial(),
      ],
    );
  });
}
