import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class PaymentHistoryScreen extends StatefulWidget {
  const PaymentHistoryScreen({super.key});
  @override
  State<PaymentHistoryScreen> createState() => _PaymentHistoryScreenState();
}

class _PaymentHistoryScreenState extends State<PaymentHistoryScreen> {
  late Future<List<Map<String, dynamic>>> future = _load();

  Future<List<Map<String, dynamic>>> _load() async {
    final rows = await db
        .from('payments')
        .select('id, provider_reference, purpose, department_id, amount, currency, status, created_at, departments(name)')
        .eq('user_id', db.auth.currentUser!.id)
        .order('created_at', ascending: false)
        .limit(200);
    return List<Map<String, dynamic>>.from(rows);
  }

  // verify-payment is idempotent and re-checks with Paystack, so calling it again is a safe recheck.
  Future<void> _recheck(Map<String, dynamic> p) async {
    try {
      final res = await db.functions.invoke('verify-payment', body: {
        'reference': p['provider_reference'],
        'department_id': p['department_id'],
        'purpose': p['purpose'],
      });
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? 'Could not check this payment.';
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(d['alreadyProcessed'] == true
              ? 'Confirmed — already recorded.'
              : 'Confirmed — recorded and access granted.')));
      setState(() => future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(functionErrorMessage(e, '$e'))));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Payment history')),
        body: AsyncBody<List<Map<String, dynamic>>>(
          future: future,
          builder: (context, rows) {
            if (rows.isEmpty) return const Center(child: Text('No payments yet.'));
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final p = rows[i];
                final status = p['status'] as String;
                final color = status == 'success'
                    ? AppColors.success
                    : status == 'failed'
                        ? AppColors.danger
                        : AppColors.text3;
                final dept = (p['departments'] as Map?)?['name'] ?? (p['purpose'] as String).replaceAll('_', ' ');
                return Card(
                  child: ListTile(
                    title: Text('$dept'),
                    subtitle: Text(DateFormat.yMMMd().add_jm().format(DateTime.parse(p['created_at'] as String).toLocal())),
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('${p['currency'] == 'NGN' ? '₦' : ''}${p['amount']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(status, style: TextStyle(color: color, fontSize: 12)),
                    ]),
                    onTap: status == 'success' ? null : () => _recheck(p),
                  ),
                );
              },
            );
          },
        ),
      );
}
