import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../main.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminSettings.tsx: contact links, affiliate programme, own security code.
const _fields = [
  ('telegram', 'Telegram Handle', '@diamondsolution or a full t.me/... invite link', Icons.send_outlined),
  ('whatsapp', 'WhatsApp Interface', '+2348012345678 or a full wa.me/... or channel link', Icons.chat_bubble_outline),
  ('support_email', 'Support Email Archive', 'support@diamondsolution.com', Icons.mail_outline),
  ('twitter', 'Twitter (X) Command', '@diamondsolution or a full profile link', Icons.alternate_email),
  ('facebook', 'Facebook Network', 'facebook.com/diamondsolution', Icons.facebook_outlined),
  ('instagram', 'Instagram Feed', '@diamondsolution or a full profile link', Icons.camera_alt_outlined),
];

class AdminSettingsScreen extends StatefulWidget {
  const AdminSettingsScreen({super.key});
  @override
  State<AdminSettingsScreen> createState() => _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends State<AdminSettingsScreen> {
  final links = {for (final f in _fields) f.$1: TextEditingController()};
  final commission = TextEditingController(text: '25');
  final minWd = TextEditingController(text: '10000');
  final curCode = TextEditingController(), newCode = TextEditingController(), confirmCode = TextEditingController();
  bool autoPayout = true;
  bool loading = true;
  bool saving = false, affSaving = false, codeSaving = false;
  String? error, info, affError, affInfo, codeError, codeInfo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('institutional_links').select('telegram, whatsapp, facebook, twitter, instagram, support_email').eq('id', 1).maybeSingle(),
      db.from('app_settings').select('commission_rate, min_withdrawal_ngn, withdrawal_auto_payout_enabled').eq('id', 1).maybeSingle(),
    ]);
    final d = r[0] as Map?;
    final a = r[1] as Map?;
    if (!mounted) return;
    setState(() {
      if (d != null) {
        for (final f in _fields) {
          links[f.$1]!.text = (d[f.$1] as String?) ?? '';
        }
      }
      if (a != null) {
        commission.text = '${(asNum(a['commission_rate']) * 100).round()}';
        minWd.text = '${a['min_withdrawal_ngn']}';
        autoPayout = a['withdrawal_auto_payout_enabled'] == true;
      }
      loading = false;
    });
  }

  Future<void> _saveLinks() async {
    setState(() {
      saving = true;
      error = null;
      info = null;
    });
    try {
      final payload = {for (final f in _fields) f.$1: links[f.$1]!.text.trim().isEmpty ? null : links[f.$1]!.text.trim()};
      await db.from('institutional_links').update({...payload, 'updated_by': AuthScope.of(context).user?.id}).eq('id', 1);
      info = 'Settings saved.';
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => saving = false);
  }

  Future<void> _saveAffiliate() async {
    setState(() {
      affError = null;
      affInfo = null;
    });
    final rate = num.tryParse(commission.text);
    final ngn = num.tryParse(minWd.text);
    if (rate == null || rate < 0 || rate > 100) {
      setState(() => affError = 'Commission rate must be between 0 and 100.');
      return;
    }
    if (ngn == null || ngn <= 0) {
      setState(() => affError = 'Minimum withdrawal must be greater than 0.');
      return;
    }
    setState(() => affSaving = true);
    try {
      await db.from('app_settings').update({'commission_rate': rate / 100, 'min_withdrawal_ngn': ngn, 'withdrawal_auto_payout_enabled': autoPayout, 'updated_by': AuthScope.of(context).user?.id}).eq('id', 1);
      affInfo = 'Affiliate program settings saved.';
    } catch (e) {
      affError = '$e';
    }
    if (mounted) setState(() => affSaving = false);
  }

  Future<void> _changeCode() async {
    setState(() {
      codeError = null;
      codeInfo = null;
    });
    if (newCode.text != confirmCode.text) {
      setState(() => codeError = "New code and confirmation don't match.");
      return;
    }
    if (!RegExp(r'^\d{4,10}$').hasMatch(newCode.text)) {
      setState(() => codeError = 'The new code must be 4–10 digits.');
      return;
    }
    setState(() => codeSaving = true);
    try {
      final r = await db.functions.invoke('admin-set-stepup-code', body: {'current_code': curCode.text, 'new_code': newCode.text});
      if ((r.data as Map?)?['success'] != true) throw Exception("Couldn't change the code.");
      curCode.clear();
      newCode.clear();
      confirmCode.clear();
      codeInfo = 'Admin security code updated.';
    } catch (e) {
      codeError = functionErrorMessage(e, "Couldn't change the code.");
    }
    if (mounted) setState(() => codeSaving = false);
  }

  Widget _label(IconData? i, String t) => Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(children: [if (i != null) ...[Icon(i, size: 13, color: AppColors.text3), const SizedBox(width: 6)], Text(t, style: body(14, weight: FontWeight.w500, color: AppColors.text2))]));

  Widget _codeInput(String label, TextEditingController c, {String? hint}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _label(Icons.key, label),
        TextField(controller: c, keyboardType: TextInputType.number, maxLength: 10, decoration: InputDecoration(counterText: '', hintText: hint)),
        const SizedBox(height: 12),
      ]);

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        Row(children: [const Icon(Icons.settings_outlined, size: 22, color: AppColors.royal), const SizedBox(width: 8), Text('Settings', style: heading(24))]),
        const SizedBox(height: 4),
        Text('Contact links shown across the public-facing site.', style: body(14, color: AppColors.text3)),
        const SizedBox(height: 24),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else
          CardLuxury(
            padding: const EdgeInsets.all(24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final f in _fields) ...[_label(f.$4, f.$2), TextField(controller: links[f.$1], decoration: InputDecoration(hintText: f.$3)), const SizedBox(height: 16)],
              if (error != null) ...[Banner2(error!), const SizedBox(height: 16)],
              if (info != null) ...[Banner2(info!, success: true), const SizedBox(height: 16)],
              BtnPrimary(icon: Icons.save_outlined, label: saving ? 'Saving…' : 'Save settings', onPressed: saving ? null : _saveLinks),
            ]),
          ),
        const SizedBox(height: 24),
        CardLuxury(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [const Icon(Icons.percent, size: 17, color: AppColors.royal), const SizedBox(width: 8), Text('Affiliate program', style: heading(16))]),
            const SizedBox(height: 4),
            Text('Controls what a referrer earns, the smallest withdrawal they can request, and how payouts get settled.', style: body(14, color: AppColors.text3)),
            const SizedBox(height: 16),
            _label(null, 'Commission rate (%)'),
            TextField(controller: commission, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            Padding(padding: const EdgeInsets.only(top: 4, bottom: 16), child: Text('% of a referred payment credited to the referrer.', style: body(12, color: AppColors.text3))),
            _label(null, 'Min withdrawal (₦)'),
            TextField(controller: minWd, keyboardType: TextInputType.number),
            const SizedBox(height: 16),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => setState(() => autoPayout = !autoPayout),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Checkbox(value: autoPayout, onChanged: (v) => setState(() => autoPayout = v ?? false), activeColor: AppColors.royal, visualDensity: VisualDensity.compact),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [const Icon(Icons.account_balance_wallet_outlined, size: 14, color: AppColors.royal), const SizedBox(width: 6), Text('Automatic payouts', style: body(14, weight: FontWeight.w600))]),
                      const SizedBox(height: 2),
                      Text('When on, approving an eligible NGN bank-transfer withdrawal (Withdrawals tab) sends it via Paystack immediately. When off, every withdrawal — eligible or not — must be settled with "Mark as paid manually", so nothing pays out unless an admin confirms it happened outside this app.', style: body(12, color: AppColors.text3)),
                    ]),
                  ),
                ]),
              ),
            ),
            if (affError != null) ...[const SizedBox(height: 16), Banner2(affError!)],
            if (affInfo != null) ...[const SizedBox(height: 16), Banner2(affInfo!, success: true)],
            const SizedBox(height: 16),
            BtnPrimary(icon: Icons.save_outlined, label: affSaving ? 'Saving…' : 'Save affiliate settings', onPressed: affSaving ? null : _saveAffiliate),
          ]),
        ),
        const SizedBox(height: 24),
        CardLuxury(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [const Icon(Icons.verified_user_outlined, size: 17, color: AppColors.royal), const SizedBox(width: 8), Text('Your admin security code', style: heading(16))]),
            const SizedBox(height: 4),
            Text('Personal to your account — nobody else\'s code changes when you change yours. You enter it to open the admin area, and again in the "Security Clearance Required" prompt before destructive actions (suspending/deleting users, changing roles).', style: body(14, color: AppColors.text3)),
            const SizedBox(height: 16),
            _codeInput('Current code', curCode),
            _codeInput('New code', newCode, hint: '4–10 digits'),
            _codeInput('Confirm new code', confirmCode),
            if (codeError != null) ...[Banner2(codeError!), const SizedBox(height: 16)],
            if (codeInfo != null) ...[Banner2(codeInfo!, success: true), const SizedBox(height: 16)],
            BtnOutline(label: codeSaving ? 'Updating…' : 'Update security code', onPressed: codeSaving ? null : _changeCode),
          ]),
        ),
        const SizedBox(height: 80),
      ]);
}
