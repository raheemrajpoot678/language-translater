import React, { useState, useCallback, useEffect } from 'react';
import { LanguageSelector } from './components/LanguageSelector';
import { TranslationProgress } from './components/TranslationProgress';
import { AnalysisResultView } from './components/AnalysisResult';
import { DocumentList } from './components/DocumentList';
import { FileUpload } from './components/FileUpload';
import { Globe, Loader } from 'lucide-react';
import { Document } from './types/document';
import { TranslationStatus } from './types/translation';
import { AnalysisResult } from './types/analysis';
import { processDocument } from './services/documentProcessor';
import { extractTextFromImage } from './services/textExtraction';
import { supabase, getDocuments } from './services/supabase';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { TranslationToggle } from './components/TranslationToggle';
import { useTranslationContext } from './contexts/TranslationContext';
import { DocumentPreview } from './components/DocumentPreview';
import { analyzeDocument } from './services/documentAnalysis';

export default function App() {
  const { isTranslating, showTranslation, toggleTranslation } = useTranslationContext();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [status, setStatus] = useState<TranslationStatus>({ status: 'idle', progress: 0 });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'analysis'>('chat');
  const [documentState, setDocumentState] = useState<{
    documents: Document[];
    selectedDocuments: Set<string>;
  }>({
    documents: [],
    selectedDocuments: new Set()
  });
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [documentsPerPage, setDocumentsPerPage] = useState(5);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const loadDocuments = useCallback(async (page = 1) => {
    try {
      setIsLoadingMore(true);
      const result = await getDocuments(page, documentsPerPage);
      
      if ('error' in result) {
        setConnectionError(result.error);
        return;
      }
      
      setConnectionError(null);
      
      if (page === 1) {
        setDocumentState(prev => ({
          ...prev,
          documents: result.documents
        }));
      } else {
        setDocumentState(prev => ({
          ...prev,
          documents: [...prev.documents, ...result.documents]
        }));
      }
      
      setHasMore(result.hasMore);
      setTotalDocuments(result.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading documents:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to load documents');
    } finally {
      setIsLoadingMore(false);
    }
  }, [documentsPerPage]);

  const handleAuthSuccess = useCallback((user: any) => {
    setUser(user);
    setIsAuthenticated(true);
    setShowAuthModal(false);
    loadDocuments(1);
  }, [loadDocuments]);

  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setIsAuthenticated(false);
      setDocumentState({ documents: [], selectedDocuments: new Set() });
      setSelectedDocument(null);
      setResult(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      setStatus({ status: 'uploading', progress: 0 });
      const text = await extractTextFromImage(file);
      setStatus({ status: 'processing', progress: 50 });

      const processedResult = await processDocument(
        text,
        sourceLanguage,
        targetLanguage,
        import.meta.env.VITE_OPENAI_API_KEY
      );

      setResult(processedResult.analysisResult);
      setStatus({ status: 'completed', progress: 100 });

      const newDocument: Document = {
        id: processedResult.documentId,
        name: file.name,
        uploadDate: new Date(),
        size: file.size,
        type: file.type,
        originalText: text,
        translatedText: processedResult.translatedText
      };
      setSelectedDocument(newDocument);

      loadDocuments(1);
    } catch (error) {
      console.error('File processing error:', error);
      setStatus({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Failed to process file'
      });
      setResult(null);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLanguage, targetLanguage, loadDocuments, isProcessing]);

  const handlePreviewDocument = useCallback(async (doc: Document) => {
    setSelectedDocument(doc);
    try {
      const analysisResult = await analyzeDocument(
        doc.originalText || '',
        import.meta.env.VITE_OPENAI_API_KEY
      );
      setResult(analysisResult);
    } catch (error) {
      console.error('Error analyzing document:', error);
    }
  }, []);

  const handleDocumentDelete = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDocumentState(prev => ({
        ...prev,
        documents: prev.documents.filter(doc => doc.id !== id)
      }));

      if (selectedDocument?.id === id) {
        setSelectedDocument(null);
        setResult(null);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }, [selectedDocument]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          setIsAuthenticated(true);
          loadDocuments(1);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setIsAuthenticated(false);
      } finally {
        setIsAuthLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      setUser(user);
      setIsAuthenticated(!!user);
      
      if (event === 'SIGNED_IN' && user) {
        loadDocuments(1);
      } else if (event === 'SIGNED_OUT') {
        setDocumentState({ documents: [], selectedDocuments: new Set() });
        setSelectedDocument(null);
        setResult(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadDocuments]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LandingPage onSignIn={() => setShowAuthModal(true)} />
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                Universal Translator
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-sm text-gray-600">
                  {user.email}
                </span>
              )}
              <TranslationToggle
                isTranslating={isTranslating}
                showTranslation={showTranslation}
                onToggle={toggleTranslation}
                disabled={isProcessing}
              />
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {connectionError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{connectionError}</p>
            <button
              onClick={() => loadDocuments(1)}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <LanguageSelector
              value={sourceLanguage}
              onChange={setSourceLanguage}
              label="Source Language"
            />
            <LanguageSelector
              value={targetLanguage}
              onChange={setTargetLanguage}
              label="Target Language"
            />
          </div>

          {selectedDocument && (
            <DocumentPreview
              document={selectedDocument}
              onClose={() => {
                setSelectedDocument(null);
                setResult(null);
              }}
              apiKey={import.meta.env.VITE_OPENAI_API_KEY}
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
            />
          )}

          {result && selectedDocument && (
            <div className="space-y-8">
              <AnalysisResultView
                result={result}
                onActionToggle={() => {}}
                documentContent={selectedDocument.originalText || ''}
                apiKey={import.meta.env.VITE_OPENAI_API_KEY}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                onLanguageSwitch={toggleTranslation}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-6">
              <FileUpload onFileSelect={handleFileSelect} />
              <TranslationProgress status={status} />
            </div>

            <div className="space-y-4">
              <DocumentList
                documents={documentState.documents}
                selectedDocuments={documentState.selectedDocuments}
                onSelect={() => {}}
                onDelete={handleDocumentDelete}
                onToggleExpand={() => {}}
                hasMore={hasMore}
                onLoadMore={() => loadDocuments(currentPage + 1)}
                isLoadingMore={isLoadingMore}
                onPreviewDocument={handlePreviewDocument}
                onTitleEdit={() => {}}
                generateDefaultName={(index) => `Document ${index + 1}`}
                documentsPerPage={documentsPerPage}
                onDocumentsPerPageChange={(value) => {
                  setDocumentsPerPage(value);
                  loadDocuments(1);
                }}
              />
              {documentState.documents.length > 0 && (
                <div className="text-sm text-gray-500 text-center">
                  Showing {documentState.documents.length} of {totalDocuments} documents
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}