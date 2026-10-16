import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminWhatsAppNumbers.tsx. The web's "Download CSV" has no
// equivalent without a share plugin, so the app offers Copy All (comma-separated) instead.
class AdminWhatsAppScreen extends StatefulWidget {
  const AdminWhatsAppScreen({super.key});
  @override
  State<AdminWhatsAppScreen> createState() => _AdminWhatsAppScreenState();
}

class _AdminWhatsAppScreenState extends State<AdminWhatsAppScreen> {
  List<Map<String, dynamic>> rows = [];
  String search = '';
  bool loading = true;
  String? copiedId;
  bool copiedAll = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  static String _num(Map<String, dynamic> r) => ((r['whatsapp'] as String?)?.trim().isNotEmpty == true ? r['whatsapp'] : r['phone'] ?? '') as String;

  Future<void> _load() async {
    final data = await db.from('profiles').select('user_id, display_name, username, university, whatsapp, phone, departments ( name )').order('created_at', ascending: false);
    final all = List<Map<String, dynamic>>.from(data);
    if (!mounted) return;
    setState(() {
      rows = all.where((r) => ((r['whatsapp'] ?? r['phone']) as String?)?.trim().isNotEmpty == true).toList();
      loading = false;
    });
  }

  List<Map<String, dynamic>> get filtered {
    final q = search.trim().toLowerCase();
    if (q.isEmpty) return rows;
    return rows.where((r) => [_num(r), r['display_name'], r['username'], r['university'], (r['departments'] as Map?)?['name']].any((v) => '${v ?? ''}'.toLowerCase().contains(q))).toList();
  }

  void _copy(String id, String number) {
    Clipboard.setData(ClipboardData(text: number));
    setState(() => copiedId = id);
    Future<void>.delayed(const Duration(seconds: 2), () => mounted ? setState(() => copiedId = null) : null);
  }

  void _copyAll(List<Map<String, dynamic>> f) {
    Clipboard.setData(ClipboardData(text: f.map(_num).join(', ')));
    setState(() => copiedAll = true);
    Future<void>.delayed(const Duration(milliseconds: 2500), () => mounted ? setState(() => copiedAll = false) : null);
  }

  @override
  Widget build(BuildContext context) {
    final f = filtered;
    final unique = f.map((r) => _num(r).replaceAll(RegExp(r'\D'), '')).toSet().length;
    return ListView(padding: const EdgeInsets.all(20), children: [
      const AdminHeading('Users WhatsApp Numbers', subtitle: 'Dedicated repository of registered WhatsApp contact numbers for announcements and scholar outreach.'),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: _count('${f.length}', 'Contacts')),
        const SizedBox(width: 8),
        Expanded(child: _count('$unique', 'Unique')),
      ]),
      const SizedBox(height: 16),
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(hintText: 'Search by number, username, name, department, or university…')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: f.isEmpty ? null : () => _copyAll(f), icon: Icon(copiedAll ? Icons.check : Icons.copy, size: 16), label: Text(copiedAll ? 'Copied!' : 'Copy All')),
      const SizedBox(height: 16),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (f.isEmpty)
        Text('No WhatsApp numbers found.', style: body(14, color: AppColors.text3))
      else
        for (var i = 0; i < f.length; i++) _row(i, f[i]),
      const SizedBox(height: 80),
    ]);
  }

  Widget _count(String v, String l) => CardLuxury(padding: const EdgeInsets.symmetric(vertical: 8), child: Column(children: [Text(v, style: heading(18)), Text(l.toUpperCase(), style: body(10, color: AppColors.text3, letterSpacing: 0.5))]));

  Widget _row(int i, Map<String, dynamic> r) {
    final number = _num(r);
    final id = r['user_id'] as String;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: CardLuxury(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Text('${i + 1}', style: body(12, color: AppColors.text3)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(number, style: body(14, weight: FontWeight.w600).copyWith(fontFamily: 'monospace')),
              Text((r['display_name'] as String?)?.isNotEmpty == true ? r['display_name'] as String : 'Unnamed', style: body(14, weight: FontWeight.w600)),
              if ((r['username'] as String?)?.isNotEmpty == true) Text('@${r['username']}', style: body(12, color: AppColors.royal)),
              Text('${(r['university'] as String?)?.isNotEmpty == true ? r['university'] : '—'} · ${(r['departments'] as Map?)?['name'] ?? '—'}', style: body(12, color: AppColors.text3)),
            ]),
          ),
          GestureDetector(
            onTap: () => _copy(id, number),
            child: Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)), child: Icon(copiedId == id ? Icons.check : Icons.copy, size: 14, color: AppColors.text2)),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () => launchUrl(Uri.parse('https://wa.me/${number.replaceAll(RegExp(r'\D'), '')}'), mode: LaunchMode.externalApplication),
            child: Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.chat_bubble_outline, size: 14, color: AppColors.royal)),
          ),
        ]),
      ),
    );
  }
}
