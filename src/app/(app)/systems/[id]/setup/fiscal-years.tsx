import { useLocalSearchParams } from 'expo-router';

import { FiscalYears } from '../../../../../screens/fiscal-years';

export default function FiscalYearsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <FiscalYears merchantId={id} />;
}
