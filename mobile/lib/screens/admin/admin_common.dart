import 'package:flutter/material.dart';
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
