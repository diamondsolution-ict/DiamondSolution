import 'package:flutter/material.dart';

// Palette copied from the website's src/index.css.
class AppColors {
  static const canvas = Color(0xFFF8F9FB);
  static const canvasSoft = Color(0xFFEEF2FA);
  static const border = Color(0xFFDDE5F5);
  static const navy = Color(0xFF0B1E3D);
  static const royal = Color(0xFF1B3FA0);
  static const royalSoft = Color(0xFFEEF3FF);
  static const gold = Color(0xFFD4AF37);
  static const text2 = Color(0xFF334155);
  static const text3 = Color(0xFF64748B);
  static const success = Color(0xFF059669);
  static const danger = Color(0xFFE11D48);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.royal,
    primary: AppColors.royal,
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.canvas,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}
