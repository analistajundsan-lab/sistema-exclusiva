import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useChecklist, ChecklistData } from '../hooks/useChecklist'
import { useAuthStore } from '../store/auth'
import {
  ClipboardList, ChevronLeft, ChevronRight, Check, Wrench,
  Camera, FileText, Wifi, CheckCircle2, ImagePlus, X, Bus, Pencil,
} from 'lucide-react'

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 800
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.src = url
  })
}

const CAMERAS = [
  { key: 'camera_frontal', label: 'Frontal' },
  { key: 'camera_lateral_esq', label: 'Lateral Esquerda' },
  { key: 'camera_lateral_dir', label: 'Lateral Direita' },
  { key: 'camera_fadiga', label: 'Fadiga' },
  { key: 'camera_ip_motorista', label: 'IP Motorista' },
  { key: 'camera_salao', label: 'Salão' },
] as const

const DOC_STATUS_OPTIONS = [
  { value: 'SIM_EM_DIA', label: 'Sim — em dia' },
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'NAO_LOCALIZADO', label: 'Não localizado' },
]

const EMTU_OPTIONS = [
  { value: 'SIM_LOCALIZADO', label: 'Sim — localizado' },
  { value: 'DANIFICADO', label: 'Danificado — necessário troca' },
  { value: 'NAO_LOCALIZADO', label: 'Não localizado' },
]

const CHECKLIST_OPTIONS = [
  { value: 'SIM_REMOVIDO_COLOCADO_NOVO', label: 'Sim — removido antigo e colocado novo' },
  { value: 'EXTRAVIADO_COLOCADO_NOVO', label: 'Extraviado — colocado novo' },
  { value: 'NAO_MANUTENCAO_FORA_GARAGEM', label: 'Não — veículo em manutenção ou fora da garagem' },
  { value: 'JA_POSSUI_CHECKLIST_MES', label: 'Já possui checklist do mês' },
  { value: 'SEM_CHECKLIST_COLOCAR_NOVO', label: 'Sem checklist — colocar novo' },
]

const WIFI_OPTIONS = [
  { value: 'SIM_FUNCIONAL', label: 'Sim, funcional' },
  { value: 'NAO_SEM_REDE', label: 'Não — conectado porém sem rede' },
  { value: 'NAO_APARECE_LISTA', label: 'Não aparece na lista de Wi-Fi' },
  { value: 'NAO_FUNCIONA_FRETADAO', label: 'Não funciona no app Fretadão' },
]

const BOLSA_DOCUMENTOS_OPTIONS = [
  { value: 'TEM', label: 'Tem' },
  { value: 'NAO_TEM', label: 'Não tem' },
]

interface Form {
  garagem: string; prefixo: string; tipo: string
  camera_frontal: string; camera_lateral_esq: string; camera_lateral_dir: string
  camera_fadiga: string; camera_ip_motorista: string; camera_salao: string
  tem_leitor_embarque: boolean | undefined; ar_condicionado: boolean | undefined
  checklist_colocado: string[]
  crlv_status: string; emtu_status: string; artesp_status: string; emdec_status: string; bolsa_documentos: string
  qr_code: boolean | undefined; adesivo_leitor: boolean | undefined; placa_senha_wifi: boolean | undefined
  wifi_status: string[]; wifi_outro: string
  observacoes: string; evidencias: string[]
}

const INITIAL: Form = {
  garagem: '', prefixo: '', tipo: '',
  camera_frontal: '', camera_lateral_esq: '', camera_lateral_dir: '',
  camera_fadiga: '', camera_ip_motorista: '', camera_salao: '',
  tem_leitor_embarque: undefined, ar_condicionado: undefined,
  checklist_colocado: [],
  crlv_status: '', emtu_status: '', artesp_status: '', emdec_status: '', bolsa_documentos: '',
  qr_code: undefined, adesivo_leitor: undefined, placa_senha_wifi: undefined,
  wifi_status: [], wifi_outro: '',
  observacoes: '', evidencias: [],
}

function fromExisting(d: ChecklistData): Form {
  return {
    garagem: d.garagem,
    prefixo: d.prefixo,
    tipo: d.tipo,
    camera_frontal: d.camera_frontal || '',
    camera_lateral_esq: d.camera_lateral_esq || '',
    camera_lateral_dir: d.camera_lateral_dir || '',
    camera_fadiga: d.camera_fadiga || '',
    camera_ip_motorista: d.camera_ip_motorista || '',
    camera_salao: d.camera_salao || '',
    tem_leitor_embarque: d.tem_leitor_embarque,
    ar_condicionado: d.ar_condicionado,
    checklist_colocado: d.checklist_colocado || [],
    crlv_status: d.crlv_status || '',
    emtu_status: d.emtu_status || '',
    artesp_status: d.artesp_status || '',
    emdec_status: d.emdec_status || '',
    bolsa_documentos: d.bolsa_documentos || '',
    qr_code: d.qr_code,
    adesivo_leitor: d.adesivo_leitor,
    placa_senha_wifi: d.placa_senha_wifi,
    wifi_status: d.wifi_status || [],
    wifi_outro: d.wifi_outro || '',
    observacoes: d.observacoes || '',
    evidencias: d.evidencias || [],
  }
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 py-3 rounded-xl font-semibold text-sm border-2 transition-all ${
          value === true
            ? 'bg-green-600 border-green-600 text-white'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-400'
        }`}
      >Sim</button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 py-3 rounded-xl font-semibold text-sm border-2 transition-all ${
          value === false
            ? 'bg-red-500 border-red-500 text-white'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-400'
        }`}
      >Não</button>
    </div>
  )
}

function RadioCard({ options, selected, onChange }: {
  options: { value: string; label: string }[]
  selected: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      {options.map(opt => {
        const on = selected === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
              on
                ? 'border-brand-700 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500'
                : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              on ? 'border-brand-700 bg-brand-700' : 'border-gray-300 dark:border-gray-600'
            }`}>
              {on && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <span className={`text-sm font-medium ${on ? 'text-brand-800 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}`}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MultiCard({ options, selected, onChange }: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  return (
    <div className="space-y-2">
      {options.map(opt => {
        const on = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
              on
                ? 'border-brand-700 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500'
                : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
            }`}
          >
            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
              on ? 'bg-brand-700 border-brand-700' : 'border-gray-300 dark:border-gray-600'
            }`}>
              {on && <Check size={12} className="text-white" />}
            </div>
            <span className={`text-sm font-medium ${on ? 'text-brand-800 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}`}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ChecklistNovo() {
  const navigate = useNavigate()
  const location = useLocation()
  const editData: ChecklistData | undefined = (location.state as any)?.editData

  const { userUnit, userUnits, displayName, userName, role } = useAuthStore()
  const { createChecklist, updateChecklist, listGaragens, hasChecklistToday, loading, error } = useChecklist()
  const fileRef = useRef<HTMLInputElement>(null)
  const [allGaragens, setAllGaragens] = useState<string[]>([])

  useEffect(() => {
    if (role === 'admin') {
      listGaragens().then(setAllGaragens).catch(() => {})
    }
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState<Form>(
    editData
      ? fromExisting(editData)
      : { ...INITIAL, garagem: userUnit || (userUnits?.[0] ?? '') }
  )
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [duplicateError, setDuplicateError] = useState('')

  const isEdit = Boolean(editData)
  const steps = form.tipo === 'AVULSO' ? [0, 3, 4] : form.tipo === 'DOCUMENTOS' ? [0, 2, 4] : [0, 1, 2, 3, 4]
  const stepIdx = steps.indexOf(step)
  const isLast = stepIdx === steps.length - 1

  const set = (key: keyof Form, value: unknown) => {
    if (key === 'prefixo' || key === 'garagem') setDuplicateError('')
    setForm(f => ({ ...f, [key]: value }))
  }

  const canNext = () => {
    if (step === 0) return form.prefixo.trim().length > 0 && form.tipo !== '' && form.garagem !== ''
    return true
  }

  const next = async () => {
    if (!canNext()) return
    if (!isEdit && step === 0) {
      setCheckingDuplicate(true)
      setDuplicateError('')
      try {
        const exists = await hasChecklistToday(form.prefixo.trim(), form.garagem)
        if (exists) {
          setDuplicateError('CHECK-LIST REALIZADO HOJE')
          return
        }
      } finally {
        setCheckingDuplicate(false)
      }
    }
    if (isLast) { handleSubmit(); return }
    setStep(steps[stepIdx + 1])
  }
  const back = () => { if (stepIdx > 0) setStep(steps[stepIdx - 1]) }

  const handleSubmit = async () => {
    try {
      if (isEdit && editData) {
        await updateChecklist(editData.id, form)
      } else {
        await createChecklist(form)
      }
      setDone(true)
    } catch { /* error shown via hook */ }
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (form.evidencias.length + files.length > 2) {
      alert('Máximo de 2 fotos por checklist.')
      return
    }
    setImgLoading(true)
    const compressed = await Promise.all(files.map(compressImage))
    set('evidencias', [...form.evidencias, ...compressed])
    setImgLoading(false)
    e.target.value = ''
  }

  const STEP_LABELS = ['Identificação', 'Câmeras', 'Documentos', 'Wi-Fi', 'Encerramento']
  const STEP_ICONS = [Bus, Camera, FileText, Wifi, CheckCircle2]
  const currentLabel = STEP_LABELS[step] || ''
  const CurrentIcon = STEP_ICONS[step] || ClipboardList

  if (done) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {isEdit ? 'Checklist atualizado!' : 'Checklist salvo!'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
            Veículo <strong>{form.prefixo.toUpperCase()}</strong> — {form.garagem}
          </p>
          <div className="flex gap-3">
            {!isEdit && (
              <button
                onClick={() => { setForm({ ...INITIAL, garagem: form.garagem }); setStep(0); setDone(false) }}
                className="px-5 py-2.5 border-2 border-brand-700 text-brand-700 rounded-xl font-semibold text-sm"
              >Novo Checklist</button>
            )}
            <button
              onClick={() => navigate('/checklist')}
              className="px-5 py-2.5 bg-brand-700 text-white rounded-xl font-semibold text-sm"
            >Ver Consulta</button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/checklist')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {isEdit ? <Pencil size={20} className="text-brand-700" /> : <ClipboardList size={20} className="text-brand-700" />}
            {isEdit ? `Editar Checklist #${editData?.id}` : 'Novo Checklist'}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {displayName || userName}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <CurrentIcon size={13} />
            {currentLabel}
          </span>
          <span className="text-xs text-gray-400">{stepIdx + 1}/{steps.length}</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-700 rounded-full transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-8">

        {/* ── STEP 0: Identificação ── */}
        {step === 0 && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Garagem *</label>
              {isEdit ? (
                <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {form.garagem || '—'}
                </div>
              ) : role === 'admin' ? (
                <select
                  value={form.garagem}
                  onChange={e => set('garagem', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium"
                >
                  <option value="">Selecione a garagem</option>
                  {allGaragens.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : userUnits && userUnits.length > 1 ? (
                <select
                  value={form.garagem}
                  onChange={e => set('garagem', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium"
                >
                  <option value="">Selecione a garagem</option>
                  {userUnits.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {form.garagem || '—'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Prefixo do veículo *</label>
              {isEdit ? (
                <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 text-lg font-bold text-gray-700 dark:text-gray-300 tracking-widest">
                  {form.prefixo}
                </div>
              ) : (
                <input
                  type="text"
                  value={form.prefixo}
                  onChange={e => set('prefixo', e.target.value.toUpperCase())}
                  placeholder="Ex: 1234"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-lg font-bold tracking-widest placeholder:font-normal placeholder:text-sm placeholder:tracking-normal"
                  inputMode="text"
                  autoCapitalize="characters"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de Checklist *</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['AVULSO', 'MENSAL', 'DOCUMENTOS'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    disabled={isEdit}
                    onClick={() => { if (!isEdit) set('tipo', t) }}
                    className={`py-4 rounded-xl font-bold text-sm border-2 transition-all ${
                      form.tipo === t
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    } ${isEdit ? 'opacity-60 cursor-not-allowed' : 'hover:border-brand-400'}`}
                  >
                    {t}
                    {t === 'AVULSO' && <span className="block text-[10px] font-normal mt-0.5 opacity-70">Apenas Wi-Fi</span>}
                    {t === 'MENSAL' && <span className="block text-[10px] font-normal mt-0.5 opacity-70">Completo</span>}
                    {t === 'DOCUMENTOS' && <span className="block text-[10px] font-normal mt-0.5 opacity-70">Apenas documentos</span>}
                  </button>
                ))}
              </div>
            </div>

            {duplicateError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-bold text-center">
                {duplicateError}
              </div>
            )}
          </>
        )}

        {/* ── STEP 1: Câmeras + Acessórios ── */}
        {step === 1 && (
          <>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Câmeras</p>
            {CAMERAS.map(cam => {
              const val = (form as unknown as Record<string, string>)[cam.key]
              return (
                <div key={cam.key} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{cam.label}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => set(cam.key as keyof Form, 'FUNCIONAL')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-semibold text-xs border-2 transition-all ${
                        val === 'FUNCIONAL'
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-green-400'
                      }`}
                    >
                      <Check size={13} /> Funcional
                    </button>
                    <button
                      type="button"
                      onClick={() => set(cam.key as keyof Form, 'VISITA_TECNICA')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-semibold text-xs border-2 transition-all ${
                        val === 'VISITA_TECNICA'
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-amber-400'
                      }`}
                    >
                      <Wrench size={13} /> Visita Técnica
                    </button>
                  </div>
                </div>
              )
            })}

            <div className="mt-2 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-1">Acessórios</p>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tem leitor de embarque?</p>
                <YesNo value={form.tem_leitor_embarque} onChange={v => set('tem_leitor_embarque', v)} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Ar condicionado funcionando?</p>
                <YesNo value={form.ar_condicionado} onChange={v => set('ar_condicionado', v)} />
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Documentos + Materiais ── */}
        {step === 2 && (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">CRLV</p>
              <RadioCard options={DOC_STATUS_OPTIONS} selected={form.crlv_status} onChange={v => set('crlv_status', v)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">EMTU</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">QR Code na porta do veículo</p>
              <RadioCard options={EMTU_OPTIONS} selected={form.emtu_status} onChange={v => set('emtu_status', v)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">ARTESP</p>
              <RadioCard options={DOC_STATUS_OPTIONS} selected={form.artesp_status} onChange={v => set('artesp_status', v)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">EMDEC</p>
              <RadioCard options={DOC_STATUS_OPTIONS} selected={form.emdec_status} onChange={v => set('emdec_status', v)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Foi colocado check list?</p>
              <MultiCard options={CHECKLIST_OPTIONS} selected={form.checklist_colocado} onChange={v => set('checklist_colocado', v)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 pt-1">Materiais Gráficos</p>
              {[
                { key: 'qr_code' as const, label: 'QR Code presente?' },
                { key: 'adesivo_leitor' as const, label: 'Adesivo no leitor de embarque?' },
                { key: 'placa_senha_wifi' as const, label: 'Placa de senha Wi-Fi?' },
              ].map(item => (
                <div key={item.key} className="mb-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{item.label}</p>
                  <YesNo value={form[item.key]} onChange={v => set(item.key, v)} />
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Bolsa de documentos</p>
              <RadioCard options={BOLSA_DOCUMENTOS_OPTIONS} selected={form.bolsa_documentos} onChange={v => set('bolsa_documentos', v)} />
            </div>
          </>
        )}

        {/* ── STEP 3: Wi-Fi ── */}
        {step === 3 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Wi-Fi está funcional?</p>
            <MultiCard options={WIFI_OPTIONS} selected={form.wifi_status} onChange={v => set('wifi_status', v)} />
            <input
              type="text"
              value={form.wifi_outro}
              onChange={e => set('wifi_outro', e.target.value)}
              placeholder="Outro (descreva o problema)"
              className="mt-2 w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>
        )}

        {/* ── STEP 4: Encerramento ── */}
        {step === 4 && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Observações <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <textarea
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Descreva qualquer não-conformidade encontrada no veículo..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Evidências <span className="font-normal text-gray-400">(fotos — opcional, máx. 2)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {form.evidencias.map((src, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => set('evidencias', form.evidencias.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {form.evidencias.length < 2 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={imgLoading}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors"
                  >
                    <ImagePlus size={20} />
                    <span className="text-[10px]">{imgLoading ? 'Processando...' : 'Adicionar'}</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhoto} />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        {stepIdx > 0 && (
          <button
            type="button"
            onClick={back}
            className="flex items-center gap-1 px-5 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
        )}
        <button
          type="button"
          onClick={next}
          disabled={!canNext() || loading || checkingDuplicate}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-40 text-white font-semibold text-sm transition-all"
        >
          {loading ? 'Salvando...' : checkingDuplicate ? 'Verificando...' : isLast ? (
            <><CheckCircle2 size={16} /> {isEdit ? 'Salvar Edição' : 'Salvar Checklist'}</>
          ) : (
            <>Próximo <ChevronRight size={16} /></>
          )}
        </button>
      </div>
    </Layout>
  )
}
