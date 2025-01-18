import { translateText } from './openai';
import { analyzeDocument } from './documentAnalysis';
import { supabase } from './supabase';

// Browser-compatible hashing function using Web Crypto API
async function generateTextHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text || '');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function processDocument(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  openaiKey: string
) {
  try {
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Please sign in to save documents');
    }

    // Generate text hash
    const textHash = await generateTextHash(text);

    // Check for existing document with same hash
    const { data: existingDocs, error: queryError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .eq('text_hash', textHash);

    if (queryError) {
      console.error('Error checking for existing document:', queryError);
    } else if (existingDocs && existingDocs.length > 0) {
      const existingDoc = existingDocs[0];
      return {
        originalText: existingDoc.original_text,
        translatedText: existingDoc.translated_text,
        analysisResult: await analyzeDocument(text, openaiKey),
        confidenceScore: 0.8,
        documentId: existingDoc.id
      };
    }

    // First, analyze document using OpenAI
    const analysisResult = await analyzeDocument(text, openaiKey);
    
    // Use OpenAI for translation with context
    const translationPrompt = `
      Context and background information:
      ${analysisResult.summary}
      
      Original text to translate:
      ${text}
      
      Please provide a high-quality translation from ${sourceLanguage} to ${targetLanguage}, 
      taking into account the contextual information provided above.
    `;
    
    const translatedText = await translateText(
      translationPrompt,
      sourceLanguage,
      targetLanguage,
      openaiKey
    );
    
    // Save document to Supabase
    const docData = {
      name: `Translation_${new Date().toISOString()}`,
      size: new Blob([text]).size,
      type: 'text/plain',
      original_text: text,
      translated_text: translatedText,
      image_url: null,
      user_id: user.id,
      text_hash: textHash
    };

    // const { data: savedDoc, error: saveError } = await supabase
    //   .from('documents')
    //   .insert([docData])
    //   .select()
    //   .single();

    // if (saveError) {
    //   throw saveError;
    // }

    return {
      originalText: text,
      translatedText,
      analysisResult,
      confidenceScore: 0.8,
      // documentId: savedDoc.id
    };
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
}
