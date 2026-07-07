import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { useAuthStore } from '../../store';
import {
  useCommunityFeed, useTrendingHashtags, useTrendingPosts,
  useDeletePost, useBookmarkPost,
} from '../../hooks/useApi';
import PostCard from '../../components/community/PostCard';
import { PostCardSkeleton } from '../../components/ui/Skeleton';
import { communityApi } from '../../utils/api';

const TABS = [
  { id: 'feed',     label: 'For You',  icon: 'lightning-bolt' },
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  { id: 'following',label: 'Following',icon: 'account-multiple' },
];

export default function CommunityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState('feed');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useCommunityFeed();
  const { data: trendingData, isLoading: tLoading } = useTrendingPosts();
  const { data: hashtagData } = useTrendingHashtags();
  const deletePost   = useDeletePost();

  const allPosts     = (data?.pages ?? []).flatMap((p: any) => p.posts ?? []);
  const trendingPosts = trendingData?.posts ?? [];
  const hashtags     = hashtagData?.hashtags ?? [];

  const displayPosts = activeTab === 'trending' ? trendingPosts : allPosts;
  const displayLoading = activeTab === 'trending' ? tLoading : isLoading;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleShare = useCallback(async (post: any) => {
    try {
      await Share.share({
        message: `${post.content?.slice(0,120)}…\n\nSee more on WimaKit Community`,
        title: `Post by ${post.author?.name}`,
      });
    } catch {}
  }, []);

  const handleDelete = useCallback((post: any) => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost.mutate(post._id ?? post.id) },
    ]);
  }, [deletePost]);

  const handleReport = useCallback((post: any) => {
    Alert.alert('Report Post', 'Report this post for review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', onPress: () => communityApi.report(post._id ?? post.id).then(() => {}).catch(() => {}) },
    ]);
  }, []);

  const renderHeader = () => (
    <>
      {/* Trending hashtags */}
      {hashtags.length > 0 && (
        <View style={[s.hashtagsSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <FlatList
            horizontal showsHorizontalScrollIndicator={false}
            data={hashtags}
            keyExtractor={(h: any) => h.tag}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: 10, gap: 8 }}
            renderItem={({ item: h }: any) => (
              <TouchableOpacity
                style={[s.hashtagChip, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '30' }]}
                onPress={() => router.push(`/community/hashtag/${h.tag}` as any)}
              >
                <Text style={[s.hashtagChipText, { color: colors.primary }]}>#{h.tag}</Text>
                <Text style={[s.hashtagCount, { color: colors.primary + '99' }]}>{h.count}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Community</Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>Connect, share & discover</Text>
        </View>
        <TouchableOpacity
          style={[s.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/community/create')}
        >
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={s.createBtnText}>Post</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.searchBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}
          onPress={() => router.push('/search')}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[s.tabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tab, activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? colors.primary : colors.textMuted}
            />
            <Text style={[s.tabText, { color: activeTab === tab.id ? colors.primary : colors.textMuted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {displayLoading ? (
        <FlatList
          data={[1,2,3]}
          keyExtractor={String}
          contentContainerStyle={s.feedList}
          renderItem={() => <PostCardSkeleton />}
          ListHeaderComponent={renderHeader}
        />
      ) : displayPosts.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No posts yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Be the first to share something!</Text>
          <TouchableOpacity
            style={[s.firstPostBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/community/create')}
          >
            <Text style={s.firstPostBtnText}>Create First Post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayPosts}
          keyExtractor={(p: any) => p._id ?? p.id ?? String(Math.random())}
          contentContainerStyle={s.feedList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage && activeTab === 'feed') fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          renderItem={({ item: post }) => (
            <PostCard
              post={post}
              onPress={() => router.push(`/community/post/${post._id ?? post.id}` as any)}
              onComment={() => router.push(`/community/post/${post._id ?? post.id}` as any)}
              onShare={() => handleShare(post)}
              onReport={() => handleReport(post)}
              onDelete={post.author?.id === (user?._id ?? user?.id) || post.author?._id === (user?._id ?? user?.id)
                ? () => handleDelete(post) : undefined}
            />
          )}
          ListFooterComponent={
            isFetchingNextPage
              ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
              : null
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/community/create')}
      >
        <MaterialCommunityIcons name="pencil-plus" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '900' },
  headerSub: { fontSize: 12 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '700' },
  hashtagsSection: { borderBottomWidth: 1 },
  hashtagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  hashtagChipText: { fontSize: 12, fontWeight: '700' },
  hashtagCount: { fontSize: 10, fontWeight: '600' },
  feedList: { padding: Spacing.md, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  firstPostBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg },
  firstPostBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width:0,height:4 }, shadowOpacity: 0.3, shadowRadius: 8 },
});
