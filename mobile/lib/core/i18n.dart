import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'strings.dart';

/// EN/FR for the sign-in funnel and the nav, same scope and strings as the website's
/// LanguageContext. Everything deeper stays English, as on the website.
class AppLang extends ChangeNotifier {
  AppLang() {
    _load();
  }
  String language = 'en';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('ds_language');
    if (saved == 'en' || saved == 'fr') {
      language = saved!;
      notifyListeners();
    }
  }

  Future<void> set(String lang) async {
    if (lang == language) return;
    language = lang;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ds_language', lang);
  }

  /// Adopt the language saved on the account (covers "switched on another device").
  void adopt(String? lang) {
    if ((lang == 'en' || lang == 'fr') && lang != language) {
      language = lang!;
      notifyListeners();
      SharedPreferences.getInstance().then((p) => p.setString('ds_language', lang));
    }
  }

  String t(String key) => (language == 'fr' ? stringsFr[key] : stringsEn[key]) ?? stringsEn[key] ?? key;
}
