class StellarAddressException implements Exception {
  final String message;
  const StellarAddressException(this.message);

  @override
  String toString() => 'StellarAddressException: $message';
}
