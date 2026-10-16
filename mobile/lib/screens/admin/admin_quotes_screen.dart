import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminQuotes.tsx — direct delete, no confirm, same as the web.
class AdminQuotesScreen extends StatefulWidget {
  const AdminQuotesScreen({super.key});
  @override
  State<AdminQuotesScreen> createState() => _AdminQuotesScreenState();
}

class _AdminQuotesScreenState extends State<AdminQuotesScreen> {
  final text = TextEditingController();
  final author = TextEditingController();
  List<Map<String, dynamic>> quotes = [];
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await db.from('quotes').select('id, text, author, created_at').order('created_at', ascending: false);
    if (mounted) {
      setState(() {
        quotes = List<Map<String, dynamic>>.from(rows);
        loading = false;
      });
    }
  }

  Future<void> _publish() async {
    if (text.text.trim().isEmpty) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await db.from('quotes').insert({'text': text.text.trim(), 'author': author.text.trim().isEmpty ? 'Diamond Intelligence' : author.text.trim()});
      text.clear();
      author.clear();
      await _load();
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => saving = false);
  }

  Future<void> _remove(String id) async {
    setState(() => quotes.removeWhere((q) => q['id'] == id));
    await db.from('quotes').delete().eq('id', id);
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        const AdminHeading('Quotes', subtitle: 'Published quotes rotate on the student Dashboard.'),
        const SizedBox(height: 24),
        CardLuxury(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: text, minLines: 3, maxLines: 3, decoration: const InputDecoration(hintText: 'Quote text')),
            const SizedBox(height: 12),
            TextField(controller: author, decoration: const InputDecoration(hintText: 'Author (optional — defaults to Diamond Intelligence)')),
            if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
            const SizedBox(height: 12),
            BtnPrimary(label: saving ? 'Publishing…' : 'Authenticate & Publish', onPressed: saving ? null : _publish),
          ]),
        ),
        const SizedBox(height: 24),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else if (quotes.isEmpty)
          Text('Platform awaits initial wisdom.', style: body(14, color: AppColors.text3))
        else
          for (final q in quotes)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: CardLuxury(
                padding: const EdgeInsets.all(16),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('"${q['text']}"', style: body(14, color: AppColors.text2, style: FontStyle.italic)),
                      const SizedBox(height: 4),
                      Text('— ${q['author']} · ${fmtDate(q['created_at'] as String)}', style: body(12, color: AppColors.text3)),
                    ]),
                  ),
                  GestureDetector(onTap: () => _remove(q['id'] as String), child: const Padding(padding: EdgeInsets.all(6), child: Icon(Icons.delete_outline, size: 16, color: AppColors.text3))),
                ]),
              ),
            ),
        const SizedBox(height: 80),
      ]);
}
