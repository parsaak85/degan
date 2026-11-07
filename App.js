import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/LoginScreen';
import ReserveScreen from './src/ReserveScreen';
import { scheduleThursdayReminder } from './src/reminders';
import { colors } from './src/theme';
import { reminderStatus, openReminderSettings } from './src/deviceNetwork';

export default function App() {
  const [loaded, error] = useFonts({
    Shabnam: require('./assets/fonts/shabnam.ttf'),
  });
  const [session, setSession] = useState(null);
  const reminderWarned=useRef(false);
  const exactPreviously=useRef(null);

  useEffect(() => {
    let running=false;
    const repair=async()=>{
      if(running)return;running=true;
      try{
        const before=await reminderStatus();
        const scheduled=await scheduleThursdayReminder({force:before.exact&&exactPreviously.current!==true});
        const status=await reminderStatus();
        exactPreviously.current=status.exact;
        const missing=!status.notifications?'notifications':!status.exact?'exact':!scheduled?'schedule':'';
        if(!missing)reminderWarned.current=false;
        if(missing&&reminderWarned.current!==missing){
          reminderWarned.current=missing;
          Alert.alert('یادآوری رزرو','برای یادآوری پنج‌شنبه ساعت ۹ صبح، اعلان‌ها و «هشدارها و یادآوری‌ها» را در تنظیمات دگان فعال کنید.',[
            {text:'بعداً',style:'cancel'},{text:'تنظیمات',onPress:()=>openReminderSettings().catch(()=>{})}]);
        }
      }catch{if(!reminderWarned.current){reminderWarned.current=true;Alert.alert('یادآوری ثبت نشد','برنامه را دوباره باز کنید و مجوز اعلان را بررسی کنید.');}}
      finally{running=false;}
    };
    repair();
    const sub=AppState.addEventListener('change',state=>{if(state==='active')repair();});
    return()=>sub.remove();
  }, []);

  if (!loaded && !error) {
    return <View style={{ flex: 1, backgroundColor: colors.green }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {session ? (
        <ReserveScreen session={session} onBack={() => setSession(null)} />
      ) : (
        <LoginScreen onSubmit={setSession} />
      )}
    </SafeAreaProvider>
  );
}


