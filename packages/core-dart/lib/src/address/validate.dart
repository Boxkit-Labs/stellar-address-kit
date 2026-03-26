import 'detect.dart';

bool validate(String address, {bool strict = false}) {
  final kind = detect(address);
  if (kind == null) return false;
  if (strict && address != address.toUpperCase()) return false;
  return true;
}
