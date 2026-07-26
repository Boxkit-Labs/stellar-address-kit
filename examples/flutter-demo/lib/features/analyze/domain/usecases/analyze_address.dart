import 'package:stellar_address_kit/stellar_address_kit.dart';
import '../entities/address_analysis.dart';

class AnalyzeAddress {
  AddressAnalysis call({
    required String address,
    String? memoType,
    String? memoValue,
    String? sourceAccount,
  }) {
    // 1. Parse the address kind (G, M, C)
    late String kind;
    try {
      final parsed = StellarAddress.parse(address);
      kind = parsed.kind.name.toUpperCase();
    } catch (e) {
      kind = 'Unknown';
    }

    // 2. Perform deep routing extraction
    RoutingResult? result;
    final warnings = <RoutingWarning>[];
    DestinationError? error;

    try {
      result = extractRoutingSync(RoutingInput(
        destination: address,
        memoType: memoType ?? 'none',
        memoValue: memoValue,
        sourceAccount: sourceAccount,
      ));
      warnings.addAll(result.warnings);
      error = result.destinationError;
    } catch (e) {
      if (kind == 'C') {
        warnings.add(const RoutingWarning(
          code: 'INVALID_DESTINATION',
          severity: 'error',
          message: 'Smart contracts (C-addresses) cannot be used as payment destinations.',
        ));
      } else {
        error = DestinationError(code: 'INVALID_ADDRESS', message: e.toString());
      }
    }

    return AddressAnalysis(
      addressKind: kind,
      destinationBaseAccount: result?.destinationBaseAccount ?? 'N/A',
      routingId: result?.id,
      routingSource: result?.source ?? RoutingSource.none,
      warnings: warnings,
      error: error,
    );
  }
}
