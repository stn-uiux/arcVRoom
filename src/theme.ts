// ============================================
// 🎨 ACCENT COLOR CONFIGURATION (SINGLE SOURCE OF TRUTH)
// ============================================

// 1. 여기서 색상을 변경하세요. 이제 이 파일만 수정하면 앱 전체가 바뀝니다!
export const ACCENT_400 = '#00ffc8';        // ← 밝은 액센트 (hover 등)
export const ACCENT_500 = '#00cc8f';        // ← 기본 액센트 (primary)

// HEX를 RGB로 변환 (3, 6, 8자리 지원)
const hexToRgb = (hex: string) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
};

const rgb = hexToRgb(ACCENT_400);

// 2. 투명도가 필요한 곳에서 사용 (ex: accentRgba(0.1))
export const accentRgba = (opacity: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

// 3. CSS 변수 동기화 함수 (App.tsx에서 호출)
export const syncThemeColors = () => {
  const root = document.documentElement;
  root.style.setProperty('--accent-400', ACCENT_400);
  root.style.setProperty('--accent-500', ACCENT_500);
  root.style.setProperty('--accent-r', rgb.r.toString());
  root.style.setProperty('--accent-g', rgb.g.toString());
  root.style.setProperty('--accent-b', rgb.b.toString());
};
