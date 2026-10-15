import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../main.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final p = auth.profile;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.royal,
              child: Text(auth.displayName.characters.first.toUpperCase(),
                  style: const TextStyle(fontSize: 24, color: Colors.white)),
            ),
            const SizedBox(height: 12),
            Text(auth.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            if (p?['username'] != null) Text('@${p!['username']}', style: const TextStyle(color: AppColors.royal)),
            Text(auth.user?.email ?? '', style: const TextStyle(color: AppColors.text3)),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Column(children: [
          ListTile(
            leading: const Icon(Icons.school_outlined, color: AppColors.royal),
            title: const Text('Institution'),
            subtitle: Text((p?['university'] as String?)?.isNotEmpty == true ? p!['university'] as String : 'Not set'),
          ),
          ListTile(
            leading: const Icon(Icons.phone_outlined, color: AppColors.royal),
            title: const Text('Contact'),
            subtitle: Text((p?['phone'] ?? p?['whatsapp'] ?? 'Not configured').toString()),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        onPressed: auth.signOut,
        icon: const Icon(Icons.logout),
        label: const Text('Sign out'),
      ),
    ]);
  }
}
