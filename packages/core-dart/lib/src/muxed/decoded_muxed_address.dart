class DecodedMuxedAddress {
  final String baseG;
  final BigInt id;

  const DecodedMuxedAddress({required this.baseG, required this.id});

  @override
  bool operator ==(Object other) =>
      other is DecodedMuxedAddress && other.baseG == baseG && other.id == id;

  @override
  int get hashCode => Object.hash(baseG, id);

  @override
  String toString() => 'DecodedMuxedAddress(baseG: $baseG, id: $id)';
}
