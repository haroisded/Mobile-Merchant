import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '../../../components/button';
import { Field, FieldGrid } from '../../../components/form-fields';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { TextInput } from '../../../components/text-input';
import { spacing } from '../../../themes';
import { useSandbox } from '../sandbox/context';
import { GuideTarget } from '../sandbox/guide-target';
import { addSetupRow, SETUP_PAGES } from '../sandbox-state';
import { T, TASKS } from '../tasks';
import { Frame, IndexBoxes, ListRow } from './frame';

// Setup in the practice store: one Setup page per setup permission (SETUP_PAGES), each a list and a small form —
// the shape every real Setup master has (src/components/record-list.tsx and a forms/ route).

export function SetupIndex() {
  const { holds } = useSandbox();
  const pages = SETUP_PAGES.filter((page) => TASKS.find((task) => task.setup === page.id)?.needs.some(holds));
  const sections = [...new Set(pages.map((page) => page.section))].map((section) => ({
    title: section,
    rows: pages
      .filter((page) => page.section === section)
      .map((page) => ({ label: page.title, hint: page.line, show: true, page: 'setup-list' as const, params: { setupId: page.id }, target: T.setupRow, setupId: page.id })),
  }));

  return (
    <Frame title="Setup" meta="Your permissions open these pages">
      <IndexBoxes sections={sections} />
    </Frame>
  );
}

export function SetupList() {
  const { store, params, go, back, did } = useSandbox();
  const page = SETUP_PAGES.find((candidate) => candidate.id === params.setupId);
  if (!page) return <Frame title="Setup" onBack={back}><Text variant="bodyMedium">This page is gone.</Text></Frame>;
  const rows = store.setup.filter((row) => row.page === page.id);

  return (
    <Frame
      title={page.title}
      meta={page.line}
      onBack={back}
      actions={
        <GuideTarget target={T.listNew}>
          <Button mode="contained" icon="add" onPress={() => { did(T.listNew); go('setup-form', { setupId: page.id }); }}>
            {page.newLabel}
          </Button>
        </GuideTarget>
      }
    >
      <RowBox empty={`No ${page.title.toLowerCase()} yet.`}>
        {rows.map((row, index) => (
          <ListRow key={`${row.name}-${index}`} first={index === 0} title={row.name} sub={row.detail} />
        ))}
      </RowBox>
    </Frame>
  );
}

export function SetupForm() {
  const { act, params, back, did } = useSandbox();
  const page = SETUP_PAGES.find((candidate) => candidate.id === params.setupId);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState(page?.sampleDetail ?? '');
  if (!page) return <Frame title="Setup" onBack={back}><Text variant="bodyMedium">This page is gone.</Text></Frame>;

  return (
    <Frame
      title={page.newLabel}
      meta={page.title}
      onBack={back}
      footer={
        <GuideTarget target={T.formSave}>
          <Button
            mode="contained"
            disabled={name.trim() === ''}
            onPress={() => {
              act((store) => addSetupRow(store, page.id, name.trim(), `${page.detailLabel}: ${detail.trim() || '—'}`));
              did(T.formSave);
              back();
            }}
            contentStyle={styles.leading}
          >
            Save
          </Button>
        </GuideTarget>
      }
    >
      <GuideTarget target={T.formName}>
        <FieldGrid>
          <Field label={page.nameLabel} required hint={`For example ${page.sample}`}>
            <TextInput
              mode="outlined"
              dense
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (text.trim() !== '') did(T.formName);
              }}
              accessibilityLabel={page.nameLabel}
            />
          </Field>
        </FieldGrid>
      </GuideTarget>
      <FieldGrid>
        <Field label={page.detailLabel}>
          <TextInput mode="outlined" dense value={detail} onChangeText={setDetail} accessibilityLabel={page.detailLabel} />
        </Field>
      </FieldGrid>
    </Frame>
  );
}

const styles = StyleSheet.create({
  leading: { justifyContent: 'flex-start', gap: spacing.xs },
});
