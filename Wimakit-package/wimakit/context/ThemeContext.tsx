import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors, ColorPalette } from '../constants/theme';
type ThemeMode = 'light'|'dark'|'system';
interface Ctx { mode:ThemeMode; isDark:boolean; colors:ColorPalette; setMode:(m:ThemeMode)=>void; toggleTheme:()=>void; screenWidth:number; isTablet:boolean; }
const ThemeContext = createContext<Ctx>({ mode:'system',isDark:false,colors:LightColors,setMode:()=>{},toggleTheme:()=>{},screenWidth:375,isTablet:false });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [sw, setSw] = useState(Dimensions.get('window').width);
  useEffect(() => {
    AsyncStorage.getItem('@wk_theme').then(v=>{ if(v==='light'||v==='dark'||v==='system') setModeState(v as ThemeMode); });
    const sub = Dimensions.addEventListener('change',({window})=>setSw(window.width));
    return ()=>sub?.remove();
  },[]);
  const setMode = useCallback((m:ThemeMode)=>{ setModeState(m); AsyncStorage.setItem('@wk_theme',m); },[]);
  const toggleTheme = useCallback(()=>setMode(mode==='dark'?'light':'dark'),[mode,setMode]);
  const isDark = mode==='dark'||(mode==='system'&&sys==='dark');
  return <ThemeContext.Provider value={{ mode,isDark,colors:isDark?DarkColors:LightColors,setMode,toggleTheme,screenWidth:sw,isTablet:sw>=768 }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
