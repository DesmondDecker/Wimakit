import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { useCreatePost } from '../../hooks/useApi';
import { useAuthStore } from '../../store';

type PostType = 'general' | 'product_showcase' | 'deal' | 'question' | 'poll' | 'announcement';

const POST_TYPES: { id: PostType; label: string; icon: string; color: string; desc: string }[] = [
  { id: 'general',          label: 'General',    icon: 'text',              color: '#4F46E5', desc: 'Share anything' },
  { id: 'product_showcase', label: 'Showcase',   icon: 'shopping-outline',  color: '#10B981', desc: 'Show a product' },
  { id: 'deal',             label: 'Deal',       icon: 'tag',               color: '#F59E0B', desc: 'Share a deal' },
  { id: 'question',         label: 'Question',   icon: 'help-circle',       color: '#3B82F6', desc: 'Ask community' },
  { id: 'poll',             label: 'Poll',       icon: 'poll',              color: '#8B5CF6', desc: 'Create a poll' },
  { id: 'announcement',     label: 'Announce',   icon: 'bullhorn',          color: '#EF4444', desc: 'Make announcement' },
];

const MAX_CHARS = 2000;

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const createPost = useCreatePost();

  const [postType, setPostType]     = useState<PostType>('general');
  const [content, setContent]       = useState('');
  const [images, setImages]         = useState<string[]>([]);
  const [hashtags, setHashtags]     = useState('');
  const [location, setLocation]     = useState('');
  const [showTypeModal, setShowTypeModal] = useState(false);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions]   = useState(['', '']);

  const inputRef = useRef<TextInput>(null);
  const charsLeft = MAX_CHARS - content.length;

  const pickImages = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, quality: 0.85,
      selectionLimit: 6 - images.length,
    });
    if (!result.canceled) {
      setImages(p => [...p, ...result.assets.map(a => a.uri)].slice(0, 6));
    }
  }, [images]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled) setImages(p => [...p, result.assets[0].uri].slice(0, 6));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!content.trim() && images.length === 0) {
      Toast.show({ type: 'error', text1: 'Add some content or an image to post.' }); return;
    }
    if (postType === 'poll' && (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2)) {
      Toast.show({ type: 'error', text1: 'Add a poll question and at least 2 options.' }); return;
    }

    const fd = new FormData();
    fd.append('content', content.trim() || ' ');
    fd.append('type', postType);
    if (location.trim()) fd.append('location', location.trim());

    const tagList = hashtags.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
    if (tagList.length) fd.append('hashtags', JSON.stringify(tagList));

    if (postType === 'poll' && pollQuestion.trim()) {
      const pollData = {
        question: pollQuestion.trim(),
        options: pollOptions.filter(o => o.trim()).map((text, i) => ({ id: String(i), text: text.trim(), votes: 0 })),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      fd.append('poll', JSON.stringify(pollData));
    }

    images.forEach((uri, i) => {
      fd.append('images', { uri, name: `post_img_${i}.jpg`, type: 'image/jpeg' } as any);
    });

    createPost.mutate(fd, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: '✨ Post shared!', text2: 'Your post is now live on the community feed.' });
        router.back();
      },
      onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Could not post. Try again.' }),
    });
  }, [content, images, postType, location, hashtags, pollQuestion, pollOptions, createPost, router]);

  const selectedType = POST_TYPES.find(t => t.id === postType)!;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Create Post</Text>
        <TouchableOpacity
          style={[s.postBtn, { backgroundColor: colors.primary, opacity: createPost.isPending ? 0.7 : 1 }]}
          onPress={handleSubmit} disabled={createPost.isPending}
        >
          {createPost.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.postBtnText}>Share</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Post type selector */}
          <View style={[s.typeSelector, { borderBottomColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12 }}>
              {POST_TYPES.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.typeChip, {
                    backgroundColor: postType === t.id ? t.color : colors.surfaceAlt ?? colors.surface,
                    borderColor: postType === t.id ? t.color : colors.border,
                  }]}
                  onPress={() => setPostType(t.id)}
                >
                  <MaterialCommunityIcons name={t.icon as any} size={14} color={postType === t.id ? '#fff' : colors.textMuted} />
                  <Text style={[s.typeChipText, { color: postType === t.id ? '#fff' : colors.textMuted }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Author row */}
          <View style={[s.authorRow, { backgroundColor: colors.surface }]}>
            <View style={[s.avatar, { backgroundColor: colors.primaryMuted }]}>
              {user?.avatar
                ? <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
                : <Text style={[s.avatarLetter, { color: colors.primary }]}>{(user?.name ?? 'U')[0].toUpperCase()}</Text>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.authorName, { color: colors.textPrimary }]}>{user?.name}</Text>
              <View style={[s.visibilityBadge, { backgroundColor: colors.success + '20' }]}>
                <MaterialCommunityIcons name="earth" size={11} color={colors.success} />
                <Text style={[s.visibilityText, { color: colors.success }]}>Public · {selectedType.label}</Text>
              </View>
            </View>
          </View>

          {/* Content input */}
          <View style={[s.contentWrap, { backgroundColor: colors.surface }]}>
            <TextInput
              ref={inputRef}
              style={[s.contentInput, { color: colors.textPrimary }]}
              value={content}
              onChangeText={setContent}
              placeholder={
                postType === 'question' ? "What's your question for the community?" :
                postType === 'deal' ? "Share a deal — describe the discount, product, or offer…" :
                postType === 'product_showcase' ? "Tell people about your product! Add details, price, availability…" :
                postType === 'announcement' ? "Make your announcement here…" :
                "What's on your mind? Share with the WimaKit community…"
              }
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_CHARS}
              autoFocus
              textAlignVertical="top"
            />
            <Text style={[s.charCount, { color: charsLeft < 100 ? (charsLeft < 0 ? colors.error : colors.warning) : colors.textMuted }]}>
              {charsLeft}
            </Text>
          </View>

          {/* Poll builder */}
          {postType === 'poll' && (
            <View style={[s.pollBuilder, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
              <View style={[s.pollHeader, { borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons name="poll" size={18} color={colors.primary} />
                <Text style={[s.pollHeaderText, { color: colors.textPrimary }]}>Poll Builder</Text>
              </View>
              <TextInput
                style={[s.pollQuestion, { color: colors.textPrimary, borderColor: colors.border }]}
                value={pollQuestion} onChangeText={setPollQuestion}
                placeholder="Ask your question…" placeholderTextColor={colors.textMuted}
              />
              {pollOptions.map((opt, i) => (
                <View key={i} style={s.pollOptionRow}>
                  <View style={[s.pollOptionWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[s.pollOptionNum, { color: colors.textMuted }]}>{i + 1}</Text>
                    <TextInput
                      style={[s.pollOptionInput, { color: colors.textPrimary }]}
                      value={opt} onChangeText={v => { const copy = [...pollOptions]; copy[i] = v; setPollOptions(copy); }}
                      placeholder={`Option ${i + 1}`} placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {pollOptions.length > 2 && (
                    <TouchableOpacity onPress={() => setPollOptions(p => p.filter((_, idx) => idx !== i))}>
                      <MaterialCommunityIcons name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 5 && (
                <TouchableOpacity style={[s.addOptionBtn, { borderColor: colors.primary + '50' }]}
                  onPress={() => setPollOptions(p => [...p, ''])}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  <Text style={[s.addOptionText, { color: colors.primary }]}>Add option</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Images preview */}
          {images.length > 0 && (
            <View style={s.imagesWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: Spacing.lg }}>
                {images.map((uri, i) => (
                  <View key={i} style={s.imageThumb}>
                    <Image source={{ uri }} style={s.imageThumbImg} contentFit="cover" />
                    <TouchableOpacity style={s.removeImg} onPress={() => setImages(p => p.filter((_, idx) => idx !== i))}>
                      <MaterialCommunityIcons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    {i === 0 && <View style={s.mainBadge}><Text style={s.mainBadgeText}>Cover</Text></View>}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Location & hashtags */}
          <View style={[s.metaSection, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={s.metaRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[s.metaInput, { color: colors.textPrimary }]}
                value={location} onChangeText={setLocation}
                placeholder="Add location (optional)" placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[s.metaDivider, { backgroundColor: colors.border }]} />
            <View style={s.metaRow}>
              <MaterialCommunityIcons name="pound" size={18} color={colors.textMuted} />
              <TextInput
                style={[s.metaInput, { color: colors.textPrimary }]}
                value={hashtags} onChangeText={setHashtags}
                placeholder="Add hashtags: fashion, deals, electronics…" placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom toolbar */}
      <View style={[s.toolbar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={s.toolbarBtn} onPress={pickImages} disabled={images.length >= 6}>
          <View style={[s.toolbarIcon, { backgroundColor: '#3B82F620', opacity: images.length >= 6 ? 0.4 : 1 }]}>
            <MaterialCommunityIcons name="image-multiple-outline" size={20} color="#3B82F6" />
          </View>
          <Text style={[s.toolbarBtnText, { color: colors.textMuted }]}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.toolbarBtn} onPress={takePhoto} disabled={images.length >= 6}>
          <View style={[s.toolbarIcon, { backgroundColor: '#10B98120', opacity: images.length >= 6 ? 0.4 : 1 }]}>
            <MaterialCommunityIcons name="camera-outline" size={20} color="#10B981" />
          </View>
          <Text style={[s.toolbarBtnText, { color: colors.textMuted }]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.toolbarBtn} onPress={() => setPostType('poll')}>
          <View style={[s.toolbarIcon, { backgroundColor: '#8B5CF620' }]}>
            <MaterialCommunityIcons name="poll" size={20} color="#8B5CF6" />
          </View>
          <Text style={[s.toolbarBtnText, { color: colors.textMuted }]}>Poll</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.toolbarBtn} onPress={() => {
          setContent(p => p + ' #');
          inputRef.current?.focus();
        }}>
          <View style={[s.toolbarIcon, { backgroundColor: '#F59E0B20' }]}>
            <MaterialCommunityIcons name="pound" size={20} color="#F59E0B" />
          </View>
          <Text style={[s.toolbarBtnText, { color: colors.textMuted }]}>Tag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.toolbarBtn} onPress={() => {
          setContent(p => p + ' @');
          inputRef.current?.focus();
        }}>
          <View style={[s.toolbarIcon, { backgroundColor: '#EF444420' }]}>
            <MaterialCommunityIcons name="at" size={20} color="#EF4444" />
          </View>
          <Text style={[s.toolbarBtnText, { color: colors.textMuted }]}>Mention</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  postBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.full },
  postBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  typeSelector: { borderBottomWidth: 1 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLetter: { fontSize: 18, fontWeight: '900' },
  authorName: { fontSize: 15, fontWeight: '700' },
  visibilityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 3, alignSelf: 'flex-start' },
  visibilityText: { fontSize: 10, fontWeight: '700' },
  contentWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, position: 'relative' },
  contentInput: { fontSize: 17, lineHeight: 26, minHeight: 120, paddingTop: 4 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4 },
  pollBuilder: { marginHorizontal: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  pollHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottomWidth: 1, marginBottom: 12 },
  pollHeaderText: { fontSize: 14, fontWeight: '700' },
  pollQuestion: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, fontSize: 14, marginBottom: 10 },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pollOptionWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  pollOptionNum: { fontSize: 13, fontWeight: '800', minWidth: 16 },
  pollOptionInput: { flex: 1, fontSize: 14 },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 4 },
  addOptionText: { fontSize: 13, fontWeight: '700' },
  imagesWrap: { paddingVertical: Spacing.md },
  imageThumb: { width: 110, height: 110, borderRadius: Radius.lg, overflow: 'hidden', position: 'relative' },
  imageThumbImg: { width: '100%', height: '100%' },
  removeImg: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  mainBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(79,70,229,0.85)', paddingVertical: 3, alignItems: 'center' },
  mainBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  metaSection: { borderTopWidth: 1, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  metaInput: { flex: 1, fontSize: 14 },
  metaDivider: { height: 1, marginHorizontal: Spacing.lg },
  toolbar: { borderTopWidth: 1, flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  toolbarBtn: { flex: 1, alignItems: 'center', gap: 4 },
  toolbarIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolbarBtnText: { fontSize: 10, fontWeight: '600' },
});
