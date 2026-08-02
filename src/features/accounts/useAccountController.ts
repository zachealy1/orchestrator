import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  ActiveCodexLogin,
  CodexAccount,
  CodexLoginState,
  CodexModel,
  OssProvider,
} from "../codex/types";
import type {
  AccountHandoffCandidate,
  CodexAccountProfile,
  PendingAccountHandoff,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type AccountController = {
  codexAccounts: CodexAccountProfile[];
  setCodexAccounts: StateSetter<CodexAccountProfile[]>;
  codexAccountsRef: MutableRefObject<CodexAccountProfile[]>;
  selectedAccountId: number | null;
  setSelectedAccountId: StateSetter<number | null>;
  selectedAccountIdRef: MutableRefObject<number | null>;
  connectedAccountIds: Set<number>;
  setConnectedAccountIds: StateSetter<Set<number>>;
  connectedAccountIdsRef: MutableRefObject<Set<number>>;
  codexAccount: CodexAccount | null;
  setCodexAccount: StateSetter<CodexAccount | null>;
  requiresOpenaiAuth: boolean;
  setRequiresOpenaiAuth: StateSetter<boolean>;
  loginState: CodexLoginState;
  setLoginState: StateSetter<CodexLoginState>;
  pendingLoginId: string | null;
  setPendingLoginId: StateSetter<string | null>;
  pendingLoginIdRef: MutableRefObject<string | null>;
  pendingLoginAccountId: number | null;
  setPendingLoginAccountId: StateSetter<number | null>;
  pendingLoginAccountIdRef: MutableRefObject<number | null>;
  activeCodexLogin: ActiveCodexLogin | null;
  setActiveCodexLogin: StateSetter<ActiveCodexLogin | null>;
  loginUserCode: string | null;
  setLoginUserCode: StateSetter<string | null>;
  loginError: string | null;
  setLoginError: StateSetter<string | null>;
  accountMenuOpen: boolean;
  setAccountMenuOpen: StateSetter<boolean>;
  accountMenuContainerRef: RefObject<HTMLDivElement | null>;
  useOss: boolean;
  setUseOss: StateSetter<boolean>;
  ossProvider: OssProvider;
  setOssProvider: StateSetter<OssProvider>;
  models: CodexModel[];
  setModels: StateSetter<CodexModel[]>;
  modelsRef: MutableRefObject<CodexModel[]>;
  modelLoadError: string | null;
  setModelLoadError: StateSetter<string | null>;
  modelLoadErrorRef: MutableRefObject<string | null>;
  selectedModelId: string | null;
  setSelectedModelId: StateSetter<string | null>;
  selectedReasoningEffort: string | null;
  setSelectedReasoningEffort: StateSetter<string | null>;
  pendingAccountHandoffs: Record<number, PendingAccountHandoff | undefined>;
  setPendingAccountHandoffs: StateSetter<
    Record<number, PendingAccountHandoff | undefined>
  >;
  pendingAccountHandoffsRef: MutableRefObject<
    Record<number, PendingAccountHandoff | undefined>
  >;
  accountHandoffCandidate: AccountHandoffCandidate | null;
  setAccountHandoffCandidate: StateSetter<AccountHandoffCandidate | null>;
};

export function useAccountController(): AccountController {
  const [codexAccounts, setCodexAccounts] = useState<CodexAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [connectedAccountIds, setConnectedAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [codexAccount, setCodexAccount] = useState<CodexAccount | null>(null);
  const [requiresOpenaiAuth, setRequiresOpenaiAuth] = useState(true);
  const [loginState, setLoginState] = useState<CodexLoginState>("idle");
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [pendingLoginAccountId, setPendingLoginAccountId] = useState<number | null>(
    null,
  );
  const [activeCodexLogin, setActiveCodexLogin] =
    useState<ActiveCodexLogin | null>(null);
  const [loginUserCode, setLoginUserCode] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [useOss, setUseOss] = useState(false);
  const [ossProvider, setOssProvider] = useState<OssProvider>("ollama");
  const [models, setModels] = useState<CodexModel[]>([]);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<
    string | null
  >(null);
  const [pendingAccountHandoffs, setPendingAccountHandoffs] = useState<
    Record<number, PendingAccountHandoff | undefined>
  >({});
  const [accountHandoffCandidate, setAccountHandoffCandidate] =
    useState<AccountHandoffCandidate | null>(null);

  const codexAccountsRef = useRef(codexAccounts);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const connectedAccountIdsRef = useRef(connectedAccountIds);
  const pendingLoginIdRef = useRef(pendingLoginId);
  const pendingLoginAccountIdRef = useRef(pendingLoginAccountId);
  const modelsRef = useRef(models);
  const modelLoadErrorRef = useRef(modelLoadError);
  const accountMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingAccountHandoffsRef = useRef<
    Record<number, PendingAccountHandoff | undefined>
  >({});

  codexAccountsRef.current = codexAccounts;
  selectedAccountIdRef.current = selectedAccountId;
  connectedAccountIdsRef.current = connectedAccountIds;
  pendingLoginIdRef.current = pendingLoginId;
  pendingLoginAccountIdRef.current = pendingLoginAccountId;
  modelsRef.current = models;
  modelLoadErrorRef.current = modelLoadError;
  pendingAccountHandoffsRef.current = pendingAccountHandoffs;

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const container = accountMenuContainerRef.current;
      if (
        container &&
        event.target instanceof Node &&
        container.contains(event.target)
      ) {
        return;
      }
      setAccountMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    const selectedModel =
      models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;

    if (!selectedModel) {
      setSelectedReasoningEffort(null);
      return;
    }

    const efforts = selectedModel.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    );
    setSelectedReasoningEffort((current) => {
      if (current && efforts.includes(current)) return current;
      if (efforts.includes(selectedModel.defaultReasoningEffort)) {
        return selectedModel.defaultReasoningEffort;
      }
      return efforts[0] ?? null;
    });
  }, [models, selectedModelId]);

  return {
    codexAccounts,
    setCodexAccounts,
    codexAccountsRef,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccountIdRef,
    connectedAccountIds,
    setConnectedAccountIds,
    connectedAccountIdsRef,
    codexAccount,
    setCodexAccount,
    requiresOpenaiAuth,
    setRequiresOpenaiAuth,
    loginState,
    setLoginState,
    pendingLoginId,
    setPendingLoginId,
    pendingLoginIdRef,
    pendingLoginAccountId,
    setPendingLoginAccountId,
    pendingLoginAccountIdRef,
    activeCodexLogin,
    setActiveCodexLogin,
    loginUserCode,
    setLoginUserCode,
    loginError,
    setLoginError,
    accountMenuOpen,
    setAccountMenuOpen,
    accountMenuContainerRef,
    useOss,
    setUseOss,
    ossProvider,
    setOssProvider,
    models,
    setModels,
    modelsRef,
    modelLoadError,
    setModelLoadError,
    modelLoadErrorRef,
    selectedModelId,
    setSelectedModelId,
    selectedReasoningEffort,
    setSelectedReasoningEffort,
    pendingAccountHandoffs,
    setPendingAccountHandoffs,
    pendingAccountHandoffsRef,
    accountHandoffCandidate,
    setAccountHandoffCandidate,
  };
}
