import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing, FontSize } from '../../../constants/theme';
import { useHashtagPosts } from '../../../hooks/useApi';
import PostCard from '../../../components/community/PostCard';
import { PostCardSkeleton } from '../../../components/ui/Skeleton';

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading } = useHashtagPosts(tag ?? '');
  const posts = data?.posts ?? [];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.tag, { color: colors.primary }]}>#{tag}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{posts.length} posts</Text>
        </View>
        <TouchableOpacity style={[s.followBtn, { borderColor: colors.primary }]}
          onPress={() => {}}>
          <Text style={[s.followBtnText, { color: colors.primary }]}>Follow</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <FlatList data={[1,2,3]} keyExtractor={String} contentContainerStyle={s.list}
          renderItem={() => <PostCardSkeleton />} />
      ) : posts.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="pound" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No posts yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Be the first to post #{tag}</Text>
          <TouchableOpacity style={[s.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/community/create')}>
            <Text style={s.createBtnText}>Create Post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList data={posts} keyExtractor={(p: any) => p._id ?? p.id}
          contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
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
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  tag: { fontSize: FontSize.lg, fontWeight: '900' },
  sub: { fontSize: 12, marginTop: 1 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  followBtnText: { fontSize: 13, fontWeight: '700' },
  list: { padding: Spacing.md, paddingBottom: 80 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
