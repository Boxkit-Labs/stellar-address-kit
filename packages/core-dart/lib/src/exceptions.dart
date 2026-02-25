class StellarAddressException implements Exception {
  final String message;
  StellarAddressException(this.message);

  @override
  String toString() => 'StellarAddressException: $message';
}
