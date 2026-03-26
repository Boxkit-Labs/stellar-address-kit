import '../address/parse.dart';
import '../address/codes.dart';
import '../muxed/decode.dart';
import 'result.dart';
import 'memo.dart';

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
    final decoded = MuxedDecoder.decodeMuxedString(parsed.address);
    final baseG = decoded['baseG'] as String;
    final muxedId = (decoded['id'] as BigInt).toString();

    if (input.memoType == 'none') {
      return RoutingResult(
        destinationBaseAccount: baseG,
        routingId: muxedId,
        routingSource: RoutingSource.muxed,
        warnings: warnings,
      );
    }

    String? routingId;
    RoutingSource routingSource = RoutingSource.none;

    warnings.add(
      Warning(
        code: WarningCode.memoIgnoredForMuxed,
        severity: 'info',
        message:
            'Memo present with M-address. M-address routing ID is ignored in favor of the provided memo.',
      ),
    );

    if (input.memoType == 'id') {
      final norm = normalizeMemoId(input.memoValue ?? '');
      routingId = norm.normalized;
      if (norm.normalized != null) {
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
    } else {
      warnings.add(
        Warning(
          code: WarningCode.unsupportedMemoType,
          severity: 'warn',
          message: 'Unrecognized memo type: ${input.memoType}',
          context: WarningContext(memoType: 'unknown'),
        ),
      );
    }

    return RoutingResult(
      destinationBaseAccount: baseG,
      routingId: routingId,
      routingSource: routingSource,
      warnings: warnings,
    );
  }

  String? routingId;
  RoutingSource routingSource = RoutingSource.none;
  final warnings = List<Warning>.from(parsed.warnings);

  if (input.memoType == 'id') {
    final norm = normalizeMemoId(input.memoValue ?? '');
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

  return RoutingResult(
    destinationBaseAccount: parsed.address,
    routingId: routingId,
    routingSource: routingSource,
    warnings: warnings,
  );
}
