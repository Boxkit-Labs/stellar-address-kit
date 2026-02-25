import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  // Find spec/vectors.json by looking up from current directory
  File? findVectorsFile() {
    Directory current = Directory.current;
    for (int i = 0; i < 5; i++) {
      final file = File('${current.path}/spec/vectors.json');
      if (file.existsSync()) return file;
      final parent = current.parent;
      if (parent.path == current.path) break;
      current = parent;
    }
    return null;
  }

  final vectorsFile = findVectorsFile();
  if (vectorsFile == null) {
    print('Warning: vectors.json not found');
    return;
  }
  
  final Map<String, dynamic> vectorsJson = jsonDecode(vectorsFile.readAsStringSync()) as Map<String, dynamic>;
  final List<dynamic> cases = vectorsJson['cases'] as List<dynamic>;

  group('Vector tests', () {
    for (final dynamic c in cases) {
      final Map<String, dynamic> caseData = c as Map<String, dynamic>;
      if (caseData['module'] == 'muxed_encode') {
        test('[muxed_encode] ${caseData['description']}', () {
          final Map<String, dynamic> input = caseData['input'] as Map<String, dynamic>;
          final Map<String, dynamic> expected = caseData['expected'] as Map<String, dynamic>;
          
          final String gAddress = input['gAddress'] as String;
          final BigInt id = BigInt.parse(input['id'] as String);
          final String expectedM = expected['mAddress'] as String;

          final String result = MuxedAddress.encode(baseG: gAddress, id: id);
          expect(result, equals(expectedM));
        });
      }
    }
  });
}
