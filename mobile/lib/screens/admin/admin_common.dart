import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Colour pairs of the web's admin StatCard (`COLOR_CLASSES`).
enum StatTone { royal, rose, emerald, gold, amber }

({Color bg, Color fg}) _tone(StatTone t) => switch (t) {
      StatTone.royal => (bg: AppColors.royalSoft, fg: AppColors.royal),
      StatTone.rose => (bg: AppColors.rose50, fg: const Color(0xFFE11D48)),
      StatTone.emerald => (bg: AppColors.emerald50, fg: AppColors.emerald600),
      StatTone.gold => (bg: AppColors.goldPale, fg: AppColors.goldDark),
      StatTone.amber => (bg: const Color(0xFFFFFBEB), fg: const Color(0xFFD97706)),
    };

class AdminStatCard extends StatelessWidget {
  const AdminStatCard({super.key, required this.icon, required this.tone, required this.label, required this.value, required this.sub});
  final IconData icon;
  final StatTone tone;
  final String label;
  final String value;
  final String sub;
  @override
  Widget build(BuildContext context) {
    final c = _tone(tone);
    return CardLuxury(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(children: [
          Positioned(right: -16, top: -16, child: Container(width: 64, height: 64, decoration: BoxDecoration(color: c.bg.withValues(alpha: 0.6), shape: BoxShape.circle))),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Container(width: 32, height: 32, decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: 16, color: c.fg)),
              const SizedBox(height: 8),
              Text(label.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(20)),
              Text(sub, style: body(11, color: AppColors.text3)),
            ]),
          ),
        ]),
      ),
    );
  }
}

String compactNum(num n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(0)}k';
  return groupDigits(n);
}

/// JS `toLocaleString()` for numbers: thousands separators, up to 3 decimals.
String groupDigits(num n) {
  final neg = n < 0;
  final fixed = n.abs() == n.abs().roundToDouble() ? n.abs().toInt().toString() : n.abs().toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');
  final parts = fixed.split('.');
  final whole = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '${neg ? '-' : ''}$whole${parts.length > 1 ? '.${parts[1]}' : ''}';
}

String formatMixed(num ngn, num usd) {
  final parts = <String>[];
  if (ngn > 0) parts.add('₦${compactNum(ngn)}');
  if (usd > 0) parts.add('\$${compactNum(usd)}');
  return parts.isEmpty ? '₦0' : parts.join(' + ');
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
String fmtDate(String iso) {
  final d = DateTime.parse(iso).toLocal();
  return '${_months[d.month - 1]} ${d.day}, ${d.year}';
}

String fmtDateTime(String iso) {
  final d = DateTime.parse(iso).toLocal();
  return '${fmtDate(iso)} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

num asNum(dynamic v) => v is num ? v : (num.tryParse('$v') ?? 0);

/// Uppercase micro label above web form fields.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text.toUpperCase(), style: body(12, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
      );
}

/// Section title + subtitle the web pages open with.
class AdminHeading extends StatelessWidget {
  const AdminHeading(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: heading(24)),
        if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(subtitle!, style: body(14, color: AppColors.text3))),
      ]);
}

Future<bool> confirmDialog(BuildContext context, String message) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      content: Text(message, style: body(14)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
      ],
    ),
  );
  return r ?? false;
}

/// `window.prompt` equivalent. Returns null when dismissed.
Future<String?> promptDialog(BuildContext context, String message, {String initial = ''}) {
  final ctl = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(message, style: body(14)),
        const SizedBox(height: 12),
        TextField(controller: ctl, autofocus: true),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('OK')),
      ],
    ),
  );
}

String slugify(String s) => s.toLowerCase().trim().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'(^-|-$)'), '');

/// Web-style modal shell for admin forms (white rounded card on a navy scrim, scrollable).
Future<T?> showFormModal<T>(BuildContext context, {required String title, required Widget child}) => showDialog<T>(
      context: context,
      barrierColor: AppColors.navy.withValues(alpha: 0.5),
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: CardLuxury(
            padding: const EdgeInsets.all(24),
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(title, style: heading(18))),
                  GestureDetector(onTap: () => Navigator.pop(ctx), child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.close, size: 18, color: AppColors.text3))),
                ]),
                const SizedBox(height: 16),
                child,
              ]),
            ),
          ),
        ),
      ),
    );

Widget labeled(String label, Widget field, {String? hint, String? optional}) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text.rich(TextSpan(children: [TextSpan(text: label, style: body(14, weight: FontWeight.w500, color: AppColors.text2)), if (optional != null) TextSpan(text: ' $optional', style: body(14, color: AppColors.text3))])),
        const SizedBox(height: 4),
        field,
        if (hint != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(hint, style: body(12, color: AppColors.text3))),
      ]),
    );

/// `select ... where column in (ids)` in chunks. One request with hundreds of uuids makes a URL so long
/// the server/proxy rejects it, which left Users, Payments and Affiliates stuck on "Loading…".
Future<List<Map<String, dynamic>>> selectIn(String table, String columns, String column, Iterable<String> ids, {int chunk = 60}) async {
  final all = ids.toSet().toList();
  final out = <Map<String, dynamic>>[];
  for (var i = 0; i < all.length; i += chunk) {
    final part = all.sublist(i, i + chunk > all.length ? all.length : i + chunk);
    out.addAll(List<Map<String, dynamic>>.from(await db.from(table).select(columns).inFilter(column, part)));
  }
  return out;
}

/// user_id -> email through admin_list_emails (a POST, chunked anyway to keep each call small).
Future<Map<String, String>> emailsFor(Iterable<String> ids) async {
  final all = ids.toSet().toList();
  final out = <String, String>{};
  for (var i = 0; i < all.length; i += 200) {
    final part = all.sublist(i, i + 200 > all.length ? all.length : i + 200);
    final rows = await db.rpc('admin_list_emails', params: {'p_user_ids': part}) as List;
    for (final e in rows) {
      final id = e['user_id'];
      final mail = e['email'];
      if (id is String && mail is String) out[id] = mail;
    }
  }
  return out;
}

/// A red-bordered warning for irreversible actions (delete a department, course, level, question,
/// user). Returns true only if the admin presses the red button.
Future<bool> confirmDanger(BuildContext context, {required String title, required String message, String confirmLabel = 'Delete'}) async {
  final r = await showDialog<bool>(
    context: context,
    barrierColor: AppColors.navy.withValues(alpha: 0.5),
    builder: (ctx) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.rose200)),
      icon: Container(width: 44, height: 44, decoration: const BoxDecoration(color: AppColors.rose50, shape: BoxShape.circle), child: const Icon(Icons.warning_amber_rounded, size: 24, color: Color(0xFFE11D48))),
      title: Text(title, textAlign: TextAlign.center, style: heading(18)),
      content: Text(message, textAlign: TextAlign.center, style: body(14, color: AppColors.text2)),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        OutlinedButton(onPressed: () => Navigator.pop(ctx, false), style: OutlinedButton.styleFrom(minimumSize: const Size(110, 42)), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE11D48), minimumSize: const Size(110, 42)), child: Text(confirmLabel)),
      ],
    ),
  );
  return r ?? false;
}
