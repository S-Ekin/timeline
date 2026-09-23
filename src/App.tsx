import '@lark-base-open/js-sdk/dist/style/dashboard.css';
import './App.scss';
import './locales/i18n';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import TimeLine from './components/TimeLine';
import { useTheme } from './hooks';

dayjs.locale('zh-cn');

export default function App() {
  const { bgColor } = useTheme();
  return <TimeLine bgColor={bgColor} />;
}
