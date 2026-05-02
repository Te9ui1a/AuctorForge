import { useRef, useState } from 'react';

export type DocumentDraftState = {
  content: string;
  dirty: boolean;
};

export type DocumentStateSnapshot = {
  openPaths: string[];
  draftStateByPath: Record<string, DocumentDraftState>;
  documentPath: string;
  documentContent: string;
};

export function useWorkbenchDocuments() {
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [draftStateByPath, setDraftStateByPath] = useState<Record<string, DocumentDraftState>>({});
  const [documentPath, setDocumentPath] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const draftStateByPathRef = useRef(draftStateByPath);
  const documentPathRef = useRef(documentPath);

  draftStateByPathRef.current = draftStateByPath;
  documentPathRef.current = documentPath;

  function resetDocuments() {
    setOpenPaths([]);
    setDraftStateByPath({});
    setDocumentPath('');
    setDocumentContent('');
    documentPathRef.current = '';
    draftStateByPathRef.current = {};
  }

  function restoreDocuments(snapshot: DocumentStateSnapshot) {
    setOpenPaths(snapshot.openPaths);
    setDraftStateByPath(snapshot.draftStateByPath);
    setDocumentPath(snapshot.documentPath);
    setDocumentContent(snapshot.documentContent);
    documentPathRef.current = snapshot.documentPath;
    draftStateByPathRef.current = snapshot.draftStateByPath;
  }

  function clearDocument() {
    setDocumentPath('');
    setDocumentContent('');
    documentPathRef.current = '';
  }

  function openDocument(path: string, content: string, options?: { dirty?: boolean }) {
    documentPathRef.current = path;
    setOpenPaths((current) => (current.includes(path) ? current : [...current, path]));
    setDocumentPath(path);
    setDocumentContent(content);
    setDraftStateByPath((current) => ({
      ...current,
      [path]: {
        content,
        dirty: options?.dirty ?? false,
      },
    }));
  }

  return {
    openPaths,
    setOpenPaths,
    draftStateByPath,
    setDraftStateByPath,
    documentPath,
    setDocumentPath,
    documentContent,
    setDocumentContent,
    draftStateByPathRef,
    documentPathRef,
    resetDocuments,
    restoreDocuments,
    clearDocument,
    openDocument,
  };
}
