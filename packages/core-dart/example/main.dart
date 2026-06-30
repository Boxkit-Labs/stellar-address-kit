import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() async {
  // 1. Detect and Validate address types
  const gAddress = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  
  if (validate(gAddress)) {
    final kind = detect(gAddress);
    print('Address kind: $kind'); // AddressKind.g
  }

  // 2. High-level Parsing
  final parsed = StellarAddress.parse(gAddress);
  print('Parsed kind: ${parsed.kind}'); // AddressKind.g

  // 3. Encode a Muxed address
  final mAddress = MuxedAddress.encode(baseG: gAddress, id: BigInt.from(12345));
  print('Muxed Address: $mAddress');

  // 4. Decode a Muxed address
  final decoded = MuxedAddress.decode(mAddress);
  print('Decoded ID: ${decoded.id}'); // 12345

  // 5. Extract routing information from an incoming payment (async API)
  // This is used to reconcile deposits in a pooled account.
  final result = await extractRouting(RoutingInput(
    destination: mAddress,
    memoType: 'none',
    memoValue: null,
  ));

  print('Routing ID: ${result.id}'); // 12345
  print('Routing Source: ${result.source}'); // RoutingSource.muxed

  // 6. Synchronous variant for pure string parsing
  final syncResult = extractRoutingSync(RoutingInput(
    destination: mAddress,
    memoType: 'none',
    memoValue: null,
  ));

  print('Sync Routing ID: ${syncResult.id}'); // 12345
  print('Sync Routing Source: ${syncResult.source}'); // RoutingSource.muxed
}
