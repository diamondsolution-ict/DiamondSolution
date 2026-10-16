import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// Tokens copied from the website's src/index.css (@theme) so the app matches it.
class AppColors {
  static const canvas = Color(0xFFF8F9FB);
  static const canvasSoft = Color(0xFFEEF2FA);
  static const border = Color(0xFFDDE5F5);
  static const navy = Color(0xFF0B1E3D);
  static const navyDark = Color(0xFF07152B);
  static const royal = Color(0xFF1B3FA0);
  static const royalDark = Color(0xFF143282);
  static const royalSoft = Color(0xFFEEF3FF);
  static const royalBorder = Color(0xFFD4E0FC);
  static const gold = Color(0xFFD4AF37);
  static const goldDark = Color(0xFF996515);
  static const goldPale = Color(0xFFFEF9E7);
  static const goldBorder = Color(0xFFF5E5A4);
  static const text1 = Color(0xFF0B1E3D);
  static const text2 = Color(0xFF334155);
  static const text3 = Color(0xFF64748B);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const emerald50 = Color(0xFFECFDF5);
  static const emerald600 = Color(0xFF059669);
  static const emerald700 = Color(0xFF047857);
  static const emerald400 = Color(0xFF34D399);
  static const indigo600 = Color(0xFF4F46E5);
  static const violet50 = Color(0xFFF5F3FF);
  static const violet600 = Color(0xFF7C3AED);
  static const rose50 = Color(0xFFFFF1F2);
  static const rose200 = Color(0xFFFECDD3);
  static const rose500 = Color(0xFFF43F5E);
  static const rose700 = Color(0xFFBE123C);
  // Older screens still use these names.
  static const success = emerald600;
  static const danger = Color(0xFFE11D48);
}

/// Plus Jakarta Sans — the website's heading face.
FontWeight _clamp(FontWeight w, int lo, int hi) => FontWeight.values[(w.value.clamp(lo, hi) ~/ 100) - 1];

TextStyle heading(double size, {FontWeight weight = FontWeight.w700, Color color = AppColors.text1, double? height, double? letterSpacing}) =>
    GoogleFonts.plusJakartaSans(
        fontSize: size, fontWeight: _clamp(weight, 600, 800), color: color, height: height, letterSpacing: letterSpacing ?? -size * 0.01);

/// Public Sans — the website's body face.
TextStyle body(double size, {FontWeight weight = FontWeight.w400, Color color = AppColors.text1, double? height, FontStyle? style, double? letterSpacing}) =>
    GoogleFonts.publicSans(
        fontSize: size, fontWeight: _clamp(weight, 400, 700), color: color, height: height, fontStyle: style, letterSpacing: letterSpacing);

// .diamond-gradient: linear-gradient(135deg, navy 0%, royal 70%)
const diamondGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.navy, AppColors.royal],
  stops: [0.0, 0.7],
);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.royal,
    primary: AppColors.royal,
    surface: Colors.white,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  final textTheme = GoogleFonts.publicSansTextTheme(base.textTheme).apply(
    bodyColor: AppColors.text1,
    displayColor: AppColors.text1,
  );
  return base.copyWith(
    textTheme: textTheme,
    scaffoldBackgroundColor: AppColors.canvas,
    // Header like the website's: white, thin bottom border, bold heading title.
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: AppColors.text1,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: const Border(bottom: BorderSide(color: AppColors.border)),
      titleTextStyle: heading(18),
      iconTheme: const IconThemeData(color: AppColors.text2),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.royal, width: 1.5)),
      hintStyle: body(14, color: AppColors.text3),
      labelStyle: body(14, color: AppColors.text3),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.royal,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: body(14, weight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text2,
        side: const BorderSide(color: AppColors.border),
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: body(14, weight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.royal, textStyle: body(14, weight: FontWeight.w600)),
    ),
    dividerColor: AppColors.border,
  );
}
