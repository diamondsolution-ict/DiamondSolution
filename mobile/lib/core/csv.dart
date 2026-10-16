import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:share_plus/share_plus.dart';

// Same format as the website's src/lib/csv.ts (RFC4180-ish, quoted multi-line cells, UTF-8 BOM,
// CRLF), so a file exported on either side imports on the other.

List<List<String>> parseCsv(String text) {
  final result = <List<String>>[];
  var row = <String>[];
  final cell = StringBuffer();
  var inQuotes = false;
  void endRow() {
    row.add(cell.toString());
    cell.clear();
    if (row.any((c) => c.trim().isNotEmpty)) result.add(row);
    row = <String>[];
  }

  for (var i = 0; i < text.length; i++) {
    final ch = text[i];
    final next = i + 1 < text.length ? text[i + 1] : '';
    if (inQuotes) {
      if (ch == '"' && next == '"') {
        cell.write('"');
        i++;
      } else if (ch == '"') {
        inQuotes = false;
      } else {
        cell.write(ch);
      }
    } else if (ch == '"') {
      inQuotes = true;
    } else if (ch == ',') {
      row.add(cell.toString());
      cell.clear();
    } else if (ch == '\n' || ch == '\r') {
      endRow();
      if (ch == '\r' && next == '\n') i++;
    } else {
      cell.write(ch);
    }
  }
  if (cell.isNotEmpty || row.isNotEmpty) endRow();
  return result;
}

String toCsv(List<List<String>> rows) => '﻿${rows.map((r) => r.map((c) => '"${c.replaceAll('"', '""')}"').join(',')).join('\r\n')}';

/// The phone's share sheet stands in for the browser download: save to Drive/Files, send on WhatsApp, etc.
Future<void> shareCsv(String filename, List<List<String>> rows) async {
  final bytes = Uint8List.fromList(utf8.encode(toCsv(rows)));
  await SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, mimeType: 'text/csv', name: filename)], fileNameOverrides: [filename]));
}

/// Lets the admin pick a .csv file; returns its text, or null if cancelled.
Future<String?> pickCsvText() async {
  final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: ['csv']);
  if (files.isEmpty) return null;
  return utf8.decode(await files.first.readAsBytes(), allowMalformed: true);
}
