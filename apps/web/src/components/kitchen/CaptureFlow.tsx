'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InventorySource, Job, RecognizedItem, Unit } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { uuid } from '../../lib/uuid';
import { unitKey } from '../../lib/labels';
import { useLocations } from '../../hooks/inventory';
import { useLookupBarcode, useParseReceipt, useRecognitionSession } from '../../hooks/capture';
import { useJob } from '../../hooks/jobs';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Field, Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { LoadingState, ErrorState } from '../ui/states';
import { CameraIcon, BarcodeIcon, ReceiptIcon, PlusIcon } from '../ui/icons';
import { ReviewList } from './ReviewList';
import { PhotoCapture } from './PhotoCapture';

type Method = 'photo' | 'barcode' | 'receipt' | 'manual';
const METHODS: Method[] = ['photo', 'barcode', 'receipt', 'manual'];

const UNITS: Unit[] = ['piece', 'g', 'kg', 'ml', 'l', 'bunch', 'can', 'packet'];

export function CaptureFlow() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get('method') as Method) ?? 'photo';

  const [method, setMethod] = useState<Method>(METHODS.includes(initial) ? initial : 'photo');
  const [items, setItems] = useState<RecognizedItem[] | null>(null);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  const locationsQuery = useLocations();

  const onReceiptDone = (job: Job) => {
    if (job.status === 'done' && job.resultRef?.kind === 'recognition_session') {
      setSessionId(job.resultRef.id);
    }
  };
  const jobQuery = useJob(receiptJobId, onReceiptDone);
  const sessionQuery = useRecognitionSession(sessionId);
  useEffect(() => {
    if (sessionQuery.data && !items) setItems(sessionQuery.data.items);
  }, [sessionQuery.data, items]);

  if (added !== null) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary-text">
          <PlusIcon />
        </span>
        <p className="font-medium">{t('web.capture.addedToast', { count: String(added) })}</p>
        <div className="flex gap-2">
          <Button onClick={() => router.push('/kitchen')}>{t('web.nav.kitchen')}</Button>
          <Button
            variant="outline"
            onClick={() => {
              setItems(null);
              setSessionId(null);
              setReceiptJobId(null);
              setAdded(null);
            }}
          >
            {t('capture.title')}
          </Button>
        </div>
      </Card>
    );
  }

  if (items) {
    if (locationsQuery.isLoading || !locationsQuery.data) return <LoadingState />;
    return (
      <ReviewList
        items={items}
        locations={locationsQuery.data}
        source={
          method === 'manual'
            ? 'manual'
            : method === 'barcode'
              ? 'barcode'
              : method === 'receipt'
                ? 'receipt'
                : 'photo'
        }
        onDone={setAdded}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t('web.capture.chooseMethod')}
      >
        <MethodTab
          method="photo"
          current={method}
          onSelect={setMethod}
          icon={<CameraIcon className="h-4 w-4" />}
          label={t('capture.photo')}
        />
        <MethodTab
          method="barcode"
          current={method}
          onSelect={setMethod}
          icon={<BarcodeIcon className="h-4 w-4" />}
          label={t('capture.barcode')}
        />
        <MethodTab
          method="receipt"
          current={method}
          onSelect={setMethod}
          icon={<ReceiptIcon className="h-4 w-4" />}
          label={t('capture.receipt')}
        />
        <MethodTab
          method="manual"
          current={method}
          onSelect={setMethod}
          icon={<PlusIcon className="h-4 w-4" />}
          label={t('capture.manual')}
        />
      </div>

      {method === 'photo' ? <PhotoCapture onItems={setItems} /> : null}
      {method === 'barcode' ? <BarcodeStep onItems={setItems} /> : null}
      {method === 'receipt' ? (
        <ReceiptStep
          job={jobQuery.data}
          onStart={setReceiptJobId}
          pending={Boolean(receiptJobId) && jobQuery.data?.status !== 'failed'}
        />
      ) : null}
      {method === 'manual' ? <ManualStep onItems={setItems} /> : null}
    </div>
  );
}

function MethodTab({
  method,
  current,
  onSelect,
  icon,
  label,
}: {
  method: Method;
  current: Method;
  onSelect: (m: Method) => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = method === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(method)}
      className={
        active
          ? 'flex items-center gap-2 rounded-full border border-primary-text bg-primary-soft px-4 py-2 text-sm font-medium text-primary-text'
          : 'flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'
      }
    >
      {icon}
      {label}
    </button>
  );
}

function BarcodeStep({ onItems }: { onItems: (items: RecognizedItem[]) => void }) {
  const { t } = useLocale();
  const lookup = useLookupBarcode();
  const [code, setCode] = useState('');
  const notFound = lookup.data && !lookup.data.found;

  const submit = () => {
    lookup.mutate(code, {
      onSuccess: (res) => {
        if (!res.found || !res.match) return;
        const row: RecognizedItem = {
          tempId: uuid(),
          match: res.match,
          nameEn: res.productName ?? res.match.rawName,
          nameAr: res.productName ?? res.match.rawName,
          category: 'canned',
          quantity: res.suggestedQuantity ?? 1,
          unit: res.suggestedUnit ?? 'piece',
          confidence: res.match.confidence,
          suggestedExpiresAt: null,
          suggestedLocationType: 'pantry',
          photoKey: null,
        };
        onItems([row]);
      },
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <Field label={t('capture.barcode')} htmlFor="barcode">
        <Input
          id="barcode"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('web.capture.barcodePlaceholder')}
        />
      </Field>
      {notFound ? <Badge tone="warning">{t('capture.barcodeNotFound')}</Badge> : null}
      <Button onClick={submit} disabled={lookup.isPending || code.length < 6}>
        {t('web.capture.lookup')}
      </Button>
    </Card>
  );
}

function ReceiptStep({
  job,
  onStart,
  pending,
}: {
  job: Job | undefined;
  onStart: (jobId: string) => void;
  pending: boolean;
}) {
  const { t } = useLocale();
  const parse = useParseReceipt();
  return (
    <Card className="flex flex-col items-center gap-4 border-dashed py-10 text-center">
      <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
      <p className="font-medium">{t('web.capture.receiptCta')}</p>
      {pending || parse.isPending ? (
        <LoadingState label={t('capture.parsingReceipt')} />
      ) : (
        <Button
          onClick={() =>
            parse.mutate(['mock/receipt-1.jpg'], { onSuccess: (created) => onStart(created.id) })
          }
        >
          {t('web.capture.receiptCta')}
        </Button>
      )}
      {job?.status === 'failed' ? (
        <ErrorState error={{ code: 'JOB_FAILED', messageKey: 'errors.JOB_FAILED' }} />
      ) : null}
    </Card>
  );
}

function ManualStep({ onItems }: { onItems: (items: RecognizedItem[]) => void }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<Unit>('piece');

  const submit = (source: InventorySource) => {
    void source;
    const row: RecognizedItem = {
      tempId: uuid(),
      match: { ingredientId: null, strategy: 'created', confidence: 1, rawName: name },
      nameEn: name,
      nameAr: name,
      category: 'other',
      quantity: Number(quantity) || 1,
      unit,
      confidence: 1,
      suggestedExpiresAt: null,
      suggestedLocationType: 'pantry',
      photoKey: null,
    };
    onItems([row]);
  };

  return (
    <Card className="flex flex-col gap-4">
      <Field label={t('web.capture.manualName')} htmlFor="manual-name">
        <Input
          id="manual-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('web.capture.manualNamePlaceholder')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('inventory.quantity')} htmlFor="manual-qty">
          <Input
            id="manual-qty"
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label={t('inventory.unit')} htmlFor="manual-unit">
          <Select id="manual-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {t(unitKey(u))}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button onClick={() => submit('manual')} disabled={name.trim().length === 0}>
        {t('common.next')}
      </Button>
    </Card>
  );
}
