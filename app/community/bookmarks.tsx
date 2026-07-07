import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, FontSize } from '../../constants/theme';
import { useCommunityBookmarks } from '../../hooks/useApi';
import PostCard from '../../components/community/PostCard';
import { PostCardSkeleton } from '../../components/ui/Skeleton';

export default function BookmarksScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading } = useCommunityBookmarks();
  const posts = data?.posts ?? [];
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.textPrimary }]}>Bookmarks</Text>
        <View style={{ width: 30 }} />
      </View>
      {isLoading ? (
        <FlatList data={[1,2,3]} keyExtractor={String} contentContainerStyle={{ padding: Spacing.md }}
          renderItem={() => <PostCardSkeleton />} />
      ) : posts.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="bookmark-outline" size={64} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No bookmarks</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Posts you save will appear here.</Text>
        </View>
      ) : (
        <FlatList data={posts} keyExtractor={(p: any) => p._id ?? p.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 80 }}
          renderItem={({ item: post }) => (
            <PostCard post={post}
              onPress={() => router.push(`/community/post/${post._id ?? post.id}` as any)}
              onComment={() => router.push(`/community/post/${post._id ?? post.id}` as any)} />
          )} />
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  title: { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
});
