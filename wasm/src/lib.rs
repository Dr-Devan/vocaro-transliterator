use std::sync::Arc;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::analysis::Tokenize;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Token {
    surface: String,
    reading_form: String,
    part_of_speech: Vec<String>,
    is_oov: bool,
    begin: usize,
    end: usize,
}

#[wasm_bindgen]
pub struct Reader { inner: StatelessTokenizer<Arc<JapaneseDictionary>> }

#[wasm_bindgen]
impl Reader {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>) -> Result<Reader, JsError> {
        console_error_panic_hook::set_once();
        let dictionary = JapaneseDictionary::from_system_bytes(bytes)
            .map_err(|e| JsError::new(&e.to_string()))?;
        Ok(Self { inner: StatelessTokenizer::new(Arc::new(dictionary)) })
    }

    pub fn tokenize(&self, text: &str) -> Result<JsValue, JsError> {
        let result = self.inner.tokenize(text, Mode::B, false)
            .map_err(|e| JsError::new(&e.to_string()))?;
        let tokens: Vec<Token> = result.iter().map(|m| Token {
            surface: m.surface().to_string(), reading_form: m.reading_form().to_string(),
            part_of_speech: m.part_of_speech().to_vec(), is_oov: m.is_oov(),
            begin: m.begin_c(), end: m.end_c(),
        }).collect();
        serde_wasm_bindgen::to_value(&tokens).map_err(|e| JsError::new(&e.to_string()))
    }

    // Enumerate exact surface entries, preserving dictionary order and major POS.
    pub fn readings(&self, surface: &str, pos: &str) -> Result<JsValue, JsError> {
        let dictionary = self.inner.as_dict();
        let mut readings: Vec<String> = Vec::new();
        for entry in dictionary.lexicon().lookup(surface.as_bytes(), 0) {
            if entry.end != surface.len() { continue; }
            let info = dictionary.lexicon().get_word_info(entry.word_id)
                .map_err(|e| JsError::new(&e.to_string()))?;
            let parts = dictionary.grammar().pos_components(info.pos_id());
            if !pos.is_empty() && parts.first().map(|p| p.as_str()) != Some(pos) { continue; }
            let reading = info.reading_form().to_string();
            if !readings.contains(&reading) { readings.push(reading); }
        }
        serde_wasm_bindgen::to_value(&readings).map_err(|e| JsError::new(&e.to_string()))
    }
}
