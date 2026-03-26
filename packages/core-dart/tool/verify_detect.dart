import '../lib/src/address/detect.dart';
import '../lib/src/address/codes.dart';

void main() {
  // Test cases from spec
  final testCases = [
    // Valid G address
    {
      'address': 'GDPITATFUE5CYISX4JLXBOVUAIOFTLNQYQGPSBNUPE5SINXGJ5MR2IXQ',
      'expected': AddressKind.g,
      'description': 'Valid G address'
    },
    // Valid M address
    {
      'address': 'MDPITATFUE5CYISX4JLXBOVUAIOFTLNQYQGPSBNUPE5SINXGJ5MR2ABAAAAAAAAAAGEP6',
      'expected': AddressKind.m,
      'description': 'Valid M address'
    },
    // Valid C address
    {
      'address': 'CDDCDT7QWJOPAQLDJ673PLK77Y5GIZ4VNXUZZSCPYUJRUJ5MP4ZKVRUU',
      'expected': AddressKind.c,
      'description': 'Valid C address'
    },
    // Lowercase G address (should still detect as G)
    {
      'address': 'gdpitatfue5cyisx4jlxbovuaioftlnqyqgpsbnupe5sinxgj5mr2ixq',
      'expected': AddressKind.g,
      'description': 'Lowercase G address'
    },
    // Invalid prefix (S is for seed keys)
    {
      'address': 'SABCDEFGHIJKLMNO1234567890ABCDEFGHJKLMNPQRS',
      'expected': null,
      'description': 'Invalid prefix (seed key)'
    },
    // Invalid checksum
    {
      'address': 'GDPITATFUE5CYISX4JLXBOVUAIOFTLNQYQGPSBNUPE5SINXGJ5MR2IXX',
      'expected': null,
      'description': 'Invalid checksum'
    },
  ];

  print('Running detect() verification tests...\n');
  
  int passed = 0;
  int failed = 0;

  for (var testCase in testCases) {
    final address = testCase['address'] as String;
    final expected = testCase['expected'] as AddressKind?;
    final description = testCase['description'] as String;
    
    final result = detect(address);
    
    if (result == expected) {
      print('✓ PASS: $description');
      print('  Input: $address');
      print('  Result: $result');
      passed++;
    } else {
      print('✗ FAIL: $description');
      print('  Input: $address');
      print('  Expected: $expected');
      print('  Got: $result');
      failed++;
    }
    print('');
  }

  print('Results: $passed passed, $failed failed');
  
  if (failed > 0) {
    throw Exception('Some tests failed');
  }
}
