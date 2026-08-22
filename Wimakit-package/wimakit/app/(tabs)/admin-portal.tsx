import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { useDashboardOverview } from '../../hooks/useApi';
import { formatPrice } from '../../constants/data';
import { Avatar } from '../../components/ui/Atoms';
import { useAuthStore } from '../../store';

const { width } = Dimensions.get('window');
const CHART_HEIGHT = 180;
const CHART_WIDTH = width - Spacing.lg * 4;
const IS_TABLET = width > 768;

export default function AdminPortal() {
  const { colors } = useTheme();
  const router = useRouter();
  const [activeRange, setActiveRange] = useState('30d');
  const authUser = useAuthStore((s) => s.user);

  const { data: dashboardData, isLoading: loadingDashboard } = useDashboardOverview();

  const kpis = dashboardData?.kpis || [];
  const revenueChartData = dashboardData?.revenueChart || [];
  const recentActivity = dashboardData?.recentActivity || [];

  const chartPaths = useMemo(() => {
    if (!revenueChartData || revenueChartData.length < 2) return { line: '', area: '' };
    const points = revenueChartData;
    const maxVal = Math.max(...points.map((p: any) => p.value), 1000);
    const stepX = CHART_WIDTH / (points.length - 1);

    const linePath = points.reduce((path: string, point: any, i: number) => {
      const x = i * stepX;
      const y = CHART_HEIGHT - (point.value / maxVal) * CHART_HEIGHT;
      return i === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
    }, '');

    const areaPath = `${linePath} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;
    return { line: linePath, area: areaPath };
  }, [revenueChartData]);

  if (authUser?.role !== 'admin') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Admin access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.topNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Executive Overview</Text>
          <Text style={[styles.navSub, { color: colors.textMuted }]}>WimaKit Main Instance • v1.4.0</Text>
        </View>
        <TouchableOpacity style={[styles.profileCircle, { backgroundColor: colors.primaryMuted }]}>
          <MaterialCommunityIcons name="shield-check" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loadingDashboard ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: Spacing.xxl }} />
        ) : (
          <View style={styles.kpiGrid}>
            {kpis.map((kpi: any) => (
              <MetricCard
                key={kpi.id}
                label={kpi.label}
                value={kpi.prefix ? formatPrice(kpi.value) : kpi.value.toLocaleString()}
                trend={kpi.growth > 0 ? `+${kpi.growth}%` : `${kpi.growth}%`}
                icon={kpi.icon}
                color={kpi.color}
                colors={colors}
                onPress={() => kpi.link && router.push(kpi.link as any)}
              />
            ))}
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>REVENUE TRENDS</Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Platform Revenue</Text>
            <View style={[styles.rangePicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {['7D', '30D', '90D'].map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setActiveRange(r)}
                  style={[styles.rangeBtn, activeRange === r && { backgroundColor: colors.primaryMuted }]}
                >
                  <Text style={[styles.rangeText, { color: activeRange === r ? colors.primary : colors.textMuted }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {loadingDashboard ? (
            <ActivityIndicator style={{ height: CHART_HEIGHT }} color={colors.primary} />
          ) : revenueChartData.length > 0 ? (
            <View style={styles.chartWrapper}>
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  <SvgGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.4" />
                    <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.05" />
                  </SvgGradient>
                </Defs>
                <Path d={chartPaths.area} fill="url(#revenueGradient)" />
                <Path
                  d={chartPaths.line}
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <MaterialCommunityIcons name="chart-line-variant" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No revenue data available.</Text>
            </View>
          )}
        </View>
        
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>OPERATIONAL HUB</Text>
        <View style={styles.menu}>
          <AdminMenuBtn 
            icon="account-group-outline" title="User Directory" sub="Customer & access management"
            onPress={() => router.push('/admin?module=users' as any)} colors={colors} 
          />
          <AdminMenuBtn 
            icon="package-variant-closed" title="Catalog Moderation" sub="Inventory & quality control"
            onPress={() => router.push('/admin?module=products' as any)} colors={colors} 
          />
          <AdminMenuBtn 
            icon="shield-alert-outline" title="Dispute Resolution" sub="Resolution center & refunds"
            onPress={() => router.push('/admin?module=disputes' as any)} colors={colors} 
          />
          <AdminMenuBtn 
            icon="finance" title="Treasury & Payouts" sub="Financial reconciliation"
            onPress={() => router.push('/admin?module=payouts' as any)} colors={colors} 
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, trend, icon, color, colors, onPress }: any) {
  return (
    <TouchableOpacity 
      style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.kpiHeader}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
        <Text style={[styles.kpiTrend, { color: trend.startsWith('+') ? colors.success : colors.error }]}>{trend}</Text>
      </View>
      <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AdminMenuBtn({ icon, title, sub, onPress, colors }: any) {
  return (
    <TouchableOpacity 
      style={[styles.menuBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
      onPress={onPress}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.menuSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.border} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: Spacing.lg, paddingBottom: 100 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  navTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  navSub: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, opacity: 0.7 },
  profileCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.xl },
  kpiCard: { width: (width - Spacing.lg * 2 - Spacing.md) / 2, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, ...Shadow.sm },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kpiTrend: { fontSize: 10, fontWeight: '800' },
  kpiValue: { fontSize: FontSize.xl, fontWeight: '900', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 9, fontWeight: '700', marginTop: 4, letterSpacing: 0.5, opacity: 0.8 },

  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: Spacing.md, marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, opacity: 0.7 },

  chartCard: { padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.xl, ...Shadow.sm },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  chartTitle: { fontSize: FontSize.md, fontWeight: '800' },
  rangePicker: { flexDirection: 'row', borderRadius: Radius.md, padding: 2, borderWidth: 1 },
  rangeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  rangeText: { fontSize: 10, fontWeight: '700' },
  chartWrapper: { paddingVertical: Spacing.md },
  emptyChart: { height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyChartText: { fontSize: FontSize.sm, opacity: 0.7 },

  menu: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  menuBtn: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.md },
  menuIconWrap: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: FontSize.md, fontWeight: '700' },
  menuSub: { fontSize: 11, opacity: 0.7 },
});