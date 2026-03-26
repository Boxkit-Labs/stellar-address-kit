import 'detect.dart';
import 'codes.dart';

ParseResult parse(String input) {
  final kind = detect(input);
  if (kind == null) {
    return ParseResult(
      kind: null,
      address: input,
      warnings: [],
      error: AddressError(
        code: ErrorCode.unknownPrefix,
        input: input,
        message: 'Invalid address',
      ),
    );
  }

  final warnings = <Warning>[];
  if (input != input.toUpperCase()) {
    warnings.add(
      Warning(
        code: WarningCode.nonCanonicalAddress,
        severity: 'warn',
        message: 'Address normalized to uppercase',
        normalization: Normalization(
          original: input,
          normalized: input.toUpperCase(),
        ),
      ),
    );
  }

  return ParseResult(
    kind: kind,
    address: input.toUpperCase(),
    warnings: warnings,
  );
}
