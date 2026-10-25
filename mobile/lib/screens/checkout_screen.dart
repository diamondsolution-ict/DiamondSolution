import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/supabase.dart';

/// Result of a checkout: true = verified and access granted, false = failed,
/// null = closed without finishing or never started.
Future<bool?> startDepartmentCheckout(BuildContext context, String departmentId, {bool installment = false}) =>
    startCheckout(context, purpose: 'department_access', departmentId: departmentId, installment: installment);

/// [purpose]: department_access | device_unlock | suspension_reactivation. The amount is always
/// decided server-side (init-payment); nothing here can change what is charged.
Future<bool?> startCheckout(BuildContext context,
    {required String purpose, String? departmentId, bool installment = false}) async {
  try {
    final res = await db.functions.invoke('init-payment',
        body: {'purpose': purpose, if (departmentId != null) 'department_id': departmentId, if (installment) 'installment': true});
    final data = res.data as Map;
    if (data['success'] != true) throw data['error'] ?? 'Could not start checkout.';
    if (!context.mounted) return null;
    return await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => CheckoutScreen(
        url: data['authorization_url'] as String,
        callbackUrl: data['callback_url'] as String,
        reference: data['reference'] as String,
        verifyBody: {
          'purpose': purpose,
          if (departmentId != null) 'department_id': departmentId,
        },
      ),
    ));
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(functionErrorMessage(e, '$e'))));
    }
    return null;
  }
}

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({
    super.key,
    required this.url,
    required this.callbackUrl,
    required this.reference,
    required this.verifyBody,
  });
  final String url, callbackUrl, reference;
  final Map<String, dynamic> verifyBody;
  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  late final WebViewController controller;
  bool verifying = false;
  String? error;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (req) {
          // Paystack redirects to the callback URL when checkout finishes (success or not);
          // never load it — verify server-side instead. Cancel/close links also land here.
          if (req.url.startsWith(widget.callbackUrl)) {
            _verify();
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  // Access is granted only by verify-payment (server re-checks with Paystack); the app never
  // trusts the redirect itself as proof of payment.
  Future<void> _verify() async {
    if (verifying) return;
    setState(() {
      verifying = true;
      error = null;
    });
    try {
      final res = await db.functions.invoke('verify-payment',
          body: {'reference': widget.reference, ...widget.verifyBody});
      final data = res.data as Map;
      if (data['success'] != true) throw data['error'] ?? 'Payment could not be verified.';
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          verifying = false;
          error = functionErrorMessage(e, '$e');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Secure payment')),
        body: verifying
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(error!, textAlign: TextAlign.center),
                        const SizedBox(height: 8),
                        const Text(
                            'If you were charged, check Payment history — you can re-check it there.',
                            textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(onPressed: _verify, child: const Text('Try verifying again')),
                        TextButton(
                            onPressed: () => Navigator.of(context).pop(false),
                            child: const Text('Close')),
                      ]),
                    ),
                  )
                : WebViewWidget(controller: controller),
      );
}
