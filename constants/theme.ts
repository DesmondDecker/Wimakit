import { Dimensions, Platform } from 'react-native';
const { width: W, height: H } = Dimensions.get('window');
export const isTablet = W >= 768;
export const SCREEN_WIDTH = W;
export const SCREEN_HEIGHT = H;
export const Spacing = { xs:4, sm:8, md:16, lg:20, xl:32, xxl:48, xxxl:64, '2xl':64, safe:20 };
export const Radius  = { xs:6, sm:8, md:12, lg:16, xl:22, xxl:32, full:9999 };
export const FontSize= { tiny:10, xs:11, sm:12, md:15, lg:18, xl:22, xxl:28, hero:36 };
export const Shadow  = {
  none:{},
  sm:  { shadowColor:'#000',shadowOffset:{width:0,height:2}, shadowOpacity:0.08,shadowRadius:4,   elevation:3  },
  md:  { shadowColor:'#000',shadowOffset:{width:0,height:4}, shadowOpacity:0.12,shadowRadius:8,   elevation:6  },
  lg:  { shadowColor:'#000',shadowOffset:{width:0,height:8}, shadowOpacity:0.18,shadowRadius:16,  elevation:12 },
  xl:  { shadowColor:'#000',shadowOffset:{width:0,height:16},shadowOpacity:0.24,shadowRadius:32,  elevation:20 },
};
export const LightColors = {
  primary:'#4F46E5', primaryLight:'#818CF8', primaryMuted:'#EEF2FF', primaryDark:'#3730A3',
  primaryGradient:['#4F46E5','#7C3AED'] as string[],
  accent:'#F59E0B', accentLight:'#FCD34D', accentMuted:'#FFFBEB',
  secondary:'#10B981', secondaryMuted:'#D1FAE5',
  background:'#F8F9FC', surface:'#FFFFFF', surfaceAlt:'#F1F3F9', card:'#FFFFFF',
  textPrimary:'#0D0F14', textSecondary:'#374151', textMuted:'#6B7280',
  textDisabled:'#D1D5DB', textInverse:'#FFFFFF', textOnPrimary:'#FFFFFF',
  border:'#E5E7EB', borderStrong:'#D1D5DB', borderFocus:'#4F46E5',
  success:'#10B981', successMuted:'#ECFDF5', warning:'#F59E0B', warningMuted:'#FFFBEB',
  error:'#EF4444',   errorLight:'#FCA5A5', errorMuted:'#FEF2F2',   info:'#3B82F6',   infoMuted:'#EFF6FF',
  successLight:'#6EE7B7', warningLight:'#FDE68A', surfaceRaised:'#FFFFFF',
  gold:'#F59E0B', premium:'#7C3AED', trending:'#EF4444', online:'#10B981', offline:'#9CA3AF',
  like:'#EF4444', comment:'#3B82F6', share:'#10B981',
  overlay:'rgba(0,0,0,0.5)', overlayLight:'rgba(0,0,0,0.08)',
  skeleton:'#E5E7EB', skeletonShimmer:'#F3F4F6',
  tabBar:'#FFFFFF', tabInactive:'#9CA3AF',
};
export const DarkColors = {
  primary:'#818CF8', primaryLight:'#A5B4FC', primaryMuted:'#1E1B4B', primaryDark:'#4F46E5',
  primaryGradient:['#818CF8','#A78BFA'] as string[],
  accent:'#FBBF24', accentLight:'#FDE68A', accentMuted:'#1C1108',
  secondary:'#34D399', secondaryMuted:'#064E3B',
  background:'#080B14', surface:'#0F1322', surfaceAlt:'#141828', card:'#111827',
  textPrimary:'#F9FAFB', textSecondary:'#E5E7EB', textMuted:'#6B7280',
  textDisabled:'#374151', textInverse:'#080B14', textOnPrimary:'#FFFFFF',
  border:'#1F2937', borderStrong:'#374151', borderFocus:'#818CF8',
  success:'#34D399', successMuted:'#022C22', warning:'#FBBF24', warningMuted:'#1C1108',
  error:'#F87171',   errorLight:'#7F1D1D', errorMuted:'#1F0B0B',   info:'#60A5FA',   infoMuted:'#0C1A3A',
  successLight:'#064E3B', warningLight:'#1C1108', surfaceRaised:'#1A1F35',
  gold:'#FBBF24', premium:'#A78BFA', trending:'#F87171', online:'#34D399', offline:'#4B5563',
  like:'#F87171', comment:'#60A5FA', share:'#34D399',
  overlay:'rgba(0,0,0,0.7)', overlayLight:'rgba(255,255,255,0.05)',
  skeleton:'#1F2937', skeletonShimmer:'#2D3748',
  tabBar:'#0F1322', tabInactive:'#4B5563',
};
export type ColorPalette = typeof LightColors;
export const cols = (n: number, gap = Spacing.md) => (W - Spacing.lg*2 - gap*(n-1)) / n;
