// subtitleSupport tiers:
//   'excellent'  — Claude Sonnet 4.5 near-native, safe for live subtitles
//   'very_good'  — Solid quality, subtitles enabled but with the same guardrails
//   'unsupported' — No AI subtitles offered; UI must show "Request interpreter"
export const LANGUAGES = [
  { code: 'en', name: 'English',       nativeName: 'English',       flag: '🇬🇧', rtl: false, subtitleSupport: 'excellent' },
  { code: 'mi', name: 'Te Reo Māori',  nativeName: 'Te Reo Māori',  flag: '🇳🇿', rtl: false, subtitleSupport: 'unsupported',
    // AWS Transcribe streaming has no Māori model. LiveSubtitles component
    // detects 'unsupported' and shows a "AI subtitles unavailable — please
    // request a Language Line interpreter" banner instead of a broken feed.
    customFlag: 'MaoriFlagIcon',
    note: 'He rereke ētahi kupu hauora — Some medical terms remain in English' },
  { code: 'zh', name: 'Chinese',  nativeName: '中文',       flag: '🇨🇳', rtl: false, subtitleSupport: 'excellent' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語',     flag: '🇯🇵', rtl: false, subtitleSupport: 'excellent' },
  { code: 'ko', name: 'Korean',   nativeName: '한국어',     flag: '🇰🇷', rtl: false, subtitleSupport: 'excellent' },
  { code: 'de', name: 'German',   nativeName: 'Deutsch',    flag: '🇩🇪', rtl: false, subtitleSupport: 'excellent' },
  { code: 'nl', name: 'Dutch',    nativeName: 'Nederlands', flag: '🇳🇱', rtl: false, subtitleSupport: 'excellent' },
  { code: 'fr', name: 'French',   nativeName: 'Français',   flag: '🇫🇷', rtl: false, subtitleSupport: 'excellent' },
  { code: 'es', name: 'Spanish',  nativeName: 'Español',    flag: '🇪🇸', rtl: false, subtitleSupport: 'excellent' },
  // Arabic and Hindi: AWS Transcribe streaming coverage is limited (batch-
  // only for AR, and streaming HI just launched with narrow language pack).
  // Mark as unsupported for now — patient can still consult without live
  // subtitles, provider chart is already translated.
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',    flag: '🇸🇦', rtl: true,  subtitleSupport: 'unsupported' },
  { code: 'hi', name: 'Hindi',    nativeName: 'हिन्दी',    flag: '🇮🇳', rtl: false, subtitleSupport: 'unsupported' },
  // NZ Pacific language: Samoan (Gagana Sāmoa). Written translation still
  // works via Bedrock, but AWS Transcribe streaming has no Samoan model.
  { code: 'sm',  name: 'Samoan',      nativeName: 'Gagana Sāmoa',   flag: '🇼🇸', rtl: false, subtitleSupport: 'unsupported',
    note: 'O nisi upu fa\'afoma\'i o le a tumau i le Igilisi — Some medical terms remain in English' },
  // Marshallese and Rohingya are intentionally not offered here. Translation
  // quality is unreliable for legal/clinical text and the confidence signal
  // is uncalibrated for low-resource languages. Patients from these
  // communities should be offered a human interpreter (Language Line NZ).
]

export function getLang() {
  return sessionStorage.getItem('patient_language') || 'en'
}

export function getLangMeta(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
}

// ─── Translation table ────────────────────────────────────────────────────────
// Māori (mi) and Samoan (sm) strings marked with "// TODO cert" are AI-drafted
// and pending certified-translator review before broad rollout. Existing
// zh/ja/ko/de/fr/es/ar/hi entries have been in production since 2026-Q1.
const T = {
  // ── Triage questions ──────────────────────────────────────────────────────
  greeting: {
    en: "Kia ora! I'm Tere, your health assistant. What's your full name?",
    mi: "Kia ora! Ko Tere ahau, tō āwhina hauora. He aha tō ingoa katoa?", // TODO cert
    sm: "Talofa! O a'u o Tere, o lau fesoasoani soifua maloloina. O ai lou igoa atoa?", // TODO cert
    zh: "你好！我是Tere，您的健康助手。请问您的全名是什么？",
    ja: "こんにちは！私はTere、あなたの健康アシスタントです。お名前（フルネーム）を教えてください。",
    ko: "안녕하세요! 저는 Tere, 당신의 건강 어시스턴트입니다. 성함이 어떻게 되십니까?",
    de: "Hallo! Ich bin Tere, Ihr Gesundheitsassistent. Wie ist Ihr vollständiger Name?",
    nl: "Hallo! Ik ben Tere, uw gezondheidsassistent. Wat is uw volledige naam?",
    fr: "Bonjour ! Je suis Tere, votre assistant santé. Quel est votre nom complet ?",
    es: "¡Hola! Soy Tere, tu asistente de salud. ¿Cuál es tu nombre completo?",
    ar: "مرحباً! أنا Tere، مساعدك الصحي. ما اسمك الكامل؟",
    hi: "नमस्ते! मैं Tere हूँ, आपका स्वास्थ्य सहायक। आपका पूरा नाम क्या है?",
  },
  greeting_error: {
    en: "Can you type your full name?",
    mi: "Ka taea e koe te tāpiri i tō ingoa katoa?", // TODO cert
    sm: "E mafai ona e tusia lou igoa atoa?", // TODO cert
    zh: "请您输入全名？",
    ja: "フルネームを入力してください。",
    ko: "성함을 전부 입력해 주세요.",
    de: "Können Sie Ihren vollständigen Namen eingeben?",
    nl: "Kunt u uw volledige naam intypen?",
    fr: "Pouvez-vous entrer votre nom complet ?",
    es: "¿Puede escribir su nombre completo?",
    ar: "هل يمكنك كتابة اسمك الكامل؟",
    hi: "कृपया अपना पूरा नाम लिखें।",
  },

  dob_question: {
    en: "And your date of birth, ${firstName}? (e.g. 14 March 1986)",
    mi: "Ā, tō rā whānau, ${firstName}? (hei tauira, 14 Poutū-te-rangi 1986)", // TODO cert
    sm: "Ma le aso na e fanau ai, ${firstName}? (fa'ata'ita'iga, 14 Mati 1986)", // TODO cert
    zh: "${firstName}，您的出生日期是什么？（例如：1986年3月14日）",
    ja: "${firstName}さん、生年月日を教えてください。（例：1986年3月14日）",
    ko: "${firstName}님, 생년월일이 어떻게 되십니까? (예: 1986년 3월 14일)",
    de: "Und Ihr Geburtsdatum, ${firstName}? (z.B. 14. März 1986)",
    nl: "En uw geboortedatum, ${firstName}? (bijv. 14 maart 1986)",
    fr: "Et votre date de naissance, ${firstName} ? (ex. 14 mars 1986)",
    es: "¿Y su fecha de nacimiento, ${firstName}? (ej. 14 de marzo de 1986)",
    ar: "وتاريخ ميلادك يا ${firstName}؟ (مثلاً: 14 مارس 1986)",
    hi: "और आपकी जन्म तिथि, ${firstName}? (जैसे: 14 मार्च 1986)",
  },
  dob_error: {
    en: "Can you give me your date of birth? (e.g. 14 March 1986)",
    mi: "Ka taea e koe te tuku mai tō rā whānau? (hei tauira, 14 Poutū-te-rangi 1986)", // TODO cert
    sm: "E mafai ona e tuu mai lou aso fanau? (fa'ata'ita'iga, 14 Mati 1986)", // TODO cert
    zh: "请告诉我您的出生日期？（例如：1986年3月14日）",
    ja: "生年月日を教えてください。（例：1986年3月14日）",
    ko: "생년월일을 알려주시겠습니까? (예: 1986년 3월 14일)",
    de: "Können Sie mir Ihr Geburtsdatum nennen? (z.B. 14. März 1986)",
    nl: "Kunt u mij uw geboortedatum geven? (bijv. 14 maart 1986)",
    fr: "Pouvez-vous me donner votre date de naissance ? (ex. 14 mars 1986)",
    es: "¿Puede darme su fecha de nacimiento? (ej. 14 de marzo de 1986)",
    ar: "هل يمكنك إعطائي تاريخ ميلادك؟ (مثلاً: 14 مارس 1986)",
    hi: "क्या आप अपनी जन्म तिथि बता सकते हैं? (जैसे: 14 मार्च 1986)",
  },

  phone: {
    en: "What's your mobile number?",
    mi: "He aha tō nama waea pūkoro?", // TODO cert
    sm: "O le a lou numera telefoni feavea'i?", // TODO cert
    zh: "您的手机号码是什么？",
    ja: "携帯電話番号を教えてください。",
    ko: "휴대폰 번호가 어떻게 되십니까?",
    de: "Wie ist Ihre Handynummer?",
    nl: "Wat is uw mobiele nummer?",
    fr: "Quel est votre numéro de portable ?",
    es: "¿Cuál es su número de móvil?",
    ar: "ما هو رقم هاتفك المحمول؟",
    hi: "आपका मोबाइल नंबर क्या है?",
  },
  phone_error: {
    en: "Can you pop in your mobile number?",
    mi: "Ka taea e koe te tāpiri i tō nama waea pūkoro?", // TODO cert
    sm: "E mafai ona e tusia lou numera telefoni feavea'i?", // TODO cert
    zh: "请输入您的手机号码。",
    ja: "携帯電話番号を入力してください。",
    ko: "휴대폰 번호를 입력해 주세요.",
    de: "Können Sie Ihre Handynummer eingeben?",
    nl: "Kunt u uw mobiele nummer invoeren?",
    fr: "Pouvez-vous entrer votre numéro de portable ?",
    es: "¿Puede ingresar su número de móvil?",
    ar: "هل يمكنك إدخال رقم هاتفك المحمول؟",
    hi: "कृपया अपना मोबाइल नंबर दर्ज करें।",
  },

  email: {
    en: "What's your email? We'll send your consultation summary there.",
    mi: "He aha tō īmēra? Ka tukua e mātou tō whakarāpopoto tirohanga ki reira.", // TODO cert
    sm: "O le a lau imeli? Matou te lafo atu i ai le aotelega o lau asiasiga.", // TODO cert
    zh: "您的电子邮件地址是什么？我们将把会诊摘要发送到那里。",
    ja: "メールアドレスを教えてください。診察の要約をそちらに送ります。",
    ko: "이메일 주소가 어떻게 되십니까? 상담 요약을 그곳으로 보내드리겠습니다.",
    de: "Wie ist Ihre E-Mail-Adresse? Wir senden Ihnen die Zusammenfassung dorthin.",
    nl: "Wat is uw e-mailadres? Wij sturen de samenvatting van uw consult daarnaartoe.",
    fr: "Quelle est votre adresse e-mail ? Nous vous y enverrons le résumé de la consultation.",
    es: "¿Cuál es su correo electrónico? Le enviaremos el resumen de la consulta allí.",
    ar: "ما هو بريدك الإلكتروني؟ سنرسل ملخص استشارتك إليه.",
    hi: "आपका ईमेल क्या है? हम आपका परामर्श सारांश वहाँ भेजेंगे।",
  },
  email_error: {
    en: "Can you double-check that email address?",
    mi: "Ka taea e koe te tirotiro anō i taua wāhitau īmēra?", // TODO cert
    sm: "E mafai ona e toe siaki lena tuatusi imeli?", // TODO cert
    zh: "请再次检查您的电子邮件地址。",
    ja: "メールアドレスをご確認ください。",
    ko: "이메일 주소를 다시 확인해 주세요.",
    de: "Können Sie diese E-Mail-Adresse nochmals überprüfen?",
    nl: "Kunt u dat e-mailadres nog eens controleren?",
    fr: "Pouvez-vous vérifier cette adresse e-mail ?",
    es: "¿Puede verificar esa dirección de correo electrónico?",
    ar: "هل يمكنك التحقق من عنوان البريد الإلكتروني مرة أخرى؟",
    hi: "कृपया उस ईमेल पते को दोबारा जांचें।",
  },

  nhi: {
    en: "Do you know your NHI number? It's on your Community Services Card or any hospital letter — looks like ABC1234.",
    mi: "Kei te mōhio koe ki tō nama NHI? Kei runga i tō Kāri Ratonga Hapori, i tētahi reta hōhipera rānei — pēnei i te ABC1234.", // TODO cert
    sm: "E te iloa lou numera NHI? O lo'o i luga o lau Kata Auaunaga Fa'alenu'u po'o so'o se tusi mai le falema'i — e foliga mai o le ABC1234.", // TODO cert
    zh: "您知道您的NHI编号吗？它在您的社区服务卡或医院信件上，格式如ABC1234。",
    ja: "NHI番号はご存知ですか？コミュニティサービスカードや病院の手紙に記載されています（例：ABC1234）。",
    ko: "NHI 번호를 알고 계십니까? 커뮤니티 서비스 카드나 병원 편지에 있습니다 (예: ABC1234).",
    de: "Kennen Sie Ihre NHI-Nummer? Sie steht auf Ihrer Community Services Card oder einem Krankenhausbrief — sieht aus wie ABC1234.",
    nl: "Kent u uw NHI-nummer? Het staat op uw Community Services Card of op een ziekenhuisbrief — het ziet eruit als ABC1234.",
    fr: "Connaissez-vous votre numéro NHI ? Il figure sur votre carte de services communautaires ou toute lettre d'hôpital — ressemble à ABC1234.",
    es: "¿Conoce su número NHI? Está en su Tarjeta de Servicios Comunitarios o en cualquier carta del hospital — parece ABC1234.",
    ar: "هل تعرف رقم NHI الخاص بك؟ إنه موجود على بطاقة خدمات المجتمع أو أي رسالة مستشفى — يبدو مثل ABC1234.",
    hi: "क्या आप अपना NHI नंबर जानते हैं? यह आपके कम्युनिटी सर्विसेज कार्ड या किसी अस्पताल पत्र पर होता है — जैसे ABC1234।",
  },

  pharmacy: {
    en: "What's your preferred pharmacy? (e.g. Havelock Pharmacy)",
    mi: "He aha tō whare rongoā e pai ai koe? (hei tauira, Havelock Pharmacy)", // TODO cert
    sm: "O le a le fale talavai e sili ona e mana'o ai? (fa'ata'ita'iga, Havelock Pharmacy)", // TODO cert
    zh: "您首选的药店是哪家？（例如：Havelock Pharmacy）",
    ja: "お好みの薬局はどこですか？（例：Havelock Pharmacy）",
    ko: "선호하시는 약국이 어디입니까? (예: Havelock Pharmacy)",
    de: "Was ist Ihre bevorzugte Apotheke? (z.B. Havelock Pharmacy)",
    nl: "Welke apotheek heeft uw voorkeur? (bijv. Havelock Pharmacy)",
    fr: "Quelle est votre pharmacie préférée ? (ex. Havelock Pharmacy)",
    es: "¿Cuál es su farmacia preferida? (ej. Havelock Pharmacy)",
    ar: "ما هي صيدليتك المفضلة؟ (مثلاً: Havelock Pharmacy)",
    hi: "आपकी पसंदीदा फार्मेसी कौन सी है? (जैसे: Havelock Pharmacy)",
  },

  complaint: {
    en: "What's brought you in today? Tell me what's going on — including how long it's been happening.",
    mi: "He aha tō raruraru i tēnei rā? Kōrero mai — me pēhea te roa o tēnei raruraru.",
    sm: "O le a le mafua'aga o lou sau i le aso? Ta'u mai le mea o lo'o tupu — atoa ma le umi o lona tupu mai.", // TODO cert
    zh: "今天是什么原因来就诊？请告诉我发生了什么——包括已经持续多久了。",
    ja: "本日はどのようなことでお越しですか？症状がいつ頃から続いているかも含めて教えてください。",
    ko: "오늘 오신 이유가 무엇입니까? 얼마나 됐는지 포함해서 무슨 일인지 말씀해 주세요.",
    de: "Was führt Sie heute zu uns? Erzählen Sie mir, was los ist — und wie lange das schon so ist.",
    nl: "Wat brengt u vandaag hier? Vertel mij wat er aan de hand is — inclusief hoe lang het al speelt.",
    fr: "Qu'est-ce qui vous amène aujourd'hui ? Dites-moi ce qui se passe — y compris depuis combien de temps.",
    es: "¿Qué le trae hoy? Cuénteme qué está pasando, incluido cuánto tiempo lleva así.",
    ar: "ما الذي جاء بك اليوم؟ أخبرني بما يحدث — بما في ذلك المدة التي مضت على ذلك.",
    hi: "आज आप किस कारण से आए हैं? मुझे बताएं क्या हो रहा है — यह कितने समय से हो रहा है इसमें शामिल करें।",
  },
  complaint_error: {
    en: "Can you tell me a bit more?",
    mi: "Ka taea e koe te kōrero mai anō?", // TODO cert
    sm: "E mafai ona e ta'u mai i sisi atu?", // TODO cert
    zh: "您能告诉我多一点吗？",
    ja: "もう少し詳しく教えてもらえますか？",
    ko: "조금 더 말씀해 주시겠습니까?",
    de: "Können Sie mir etwas mehr erzählen?",
    nl: "Kunt u mij iets meer vertellen?",
    fr: "Pouvez-vous m'en dire un peu plus ?",
    es: "¿Puede contarme un poco más?",
    ar: "هل يمكنك إخباري بمزيد من التفاصيل؟",
    hi: "क्या आप मुझे थोड़ा और बता सकते हैं?",
  },

  history: {
    en: "Any relevant medical history? Past conditions, surgeries — say none if not.",
    mi: "He hītori hauora e whai pānga ana? Mate o mua, tapahi hauora — ki te kore, mea mai 'kāhore'.", // TODO cert
    sm: "E i ai ni mea taua i lou tala fa'asolopito o le soifua maloloina? Ma'i muamua, ta'otoga — fai mai 'leai' pe afai leai.", // TODO cert
    zh: "有什么相关的病史吗？过去的病症、手术——没有的话请说「无」。",
    ja: "関連する病歴はありますか？過去の病気、手術など。なければ「なし」と入力してください。",
    ko: "관련 병력이 있으십니까? 과거 질병, 수술 등 — 없으시면 '없음'이라고 하세요.",
    de: "Gibt es relevante Krankengeschichte? Frühere Erkrankungen, Operationen — sagen Sie 'keine' wenn nicht.",
    nl: "Is er relevante medische voorgeschiedenis? Eerdere aandoeningen, operaties — zeg 'geen' als er niets is.",
    fr: "Avez-vous des antécédents médicaux pertinents ? Maladies passées, opérations — dites 'aucun' si non.",
    es: "¿Tiene algún historial médico relevante? Condiciones pasadas, cirugías — diga 'ninguno' si no.",
    ar: "هل لديك تاريخ طبي ذو صلة؟ حالات سابقة، عمليات — قل 'لا شيء' إذا لم يكن.",
    hi: "कोई प्रासंगिक चिकित्सा इतिहास? पिछली बीमारियाँ, सर्जरी — अगर नहीं है तो 'कोई नहीं' कहें।",
  },

  medications: {
    en: "Are you on any regular medications?",
    mi: "E kai ana koe i ētahi rongoā?",
    sm: "E te inuina ni fualaau i taimi uma?", // TODO cert
    zh: "您有定期服药吗？",
    ja: "定期的に服用している薬はありますか？",
    ko: "정기적으로 복용하는 약이 있습니까?",
    de: "Nehmen Sie regelmäßig Medikamente?",
    nl: "Gebruikt u regelmatig medicijnen?",
    fr: "Prenez-vous des médicaments régulièrement ?",
    es: "¿Toma algún medicamento regularmente?",
    ar: "هل تتناول أدوية منتظمة؟",
    hi: "क्या आप कोई नियमित दवाएं ले रहे हैं?",
  },

  allergies: {
    en: "Any allergies — medications, foods, anything?",
    mi: "He mate huka/hukarere ōu? He rongoā, kai, aha rānei?",
    sm: "E i ai ni au allergy — fualaau, mea'ai, so'o se mea?", // TODO cert
    zh: "有过敏症吗——药物、食物或其他任何东西？",
    ja: "アレルギーはありますか？薬、食べ物、その他何でも。",
    ko: "알레르기가 있습니까? 약물, 음식, 그 외 무엇이든요.",
    de: "Haben Sie Allergien — Medikamente, Lebensmittel, irgendetwas?",
    nl: "Heeft u allergieën — medicijnen, voedsel, wat dan ook?",
    fr: "Avez-vous des allergies — médicaments, aliments, quoi que ce soit ?",
    es: "¿Tiene alguna alergia — medicamentos, alimentos, lo que sea?",
    ar: "هل لديك حساسية — أدوية، أطعمة، أي شيء؟",
    hi: "कोई एलर्जी है — दवाएं, खाना, कुछ भी?",
  },

  acc_check: {
    en: "Is your visit related to an accident or injury? ACC may cover your treatment costs.",
    mi: "He whara, he mate rānei tō haerenga? Ka taea pea e ACC ō utu maimoatanga.", // TODO cert
    sm: "Pe fa'atatau lau asiasiga i se fa'alavelave po'o se manu'a? E mafai e le ACC ona totogi au tau togafitiga.", // TODO cert
    zh: "您的就诊是否与事故或受伤有关？ACC 可能承担您的治疗费用。",
    ja: "今回の受診は事故または怪我に関連していますか？ACC が治療費をカバーする可能性があります。",
    ko: "이번 방문이 사고나 부상과 관련이 있습니까? ACC가 치료비를 부담할 수 있습니다.",
    de: "Steht Ihr Besuch im Zusammenhang mit einem Unfall oder einer Verletzung? ACC übernimmt möglicherweise Ihre Behandlungskosten.",
    nl: "Heeft uw bezoek te maken met een ongeval of letsel? ACC kan mogelijk uw behandelkosten dekken.",
    fr: "Votre visite est-elle liée à un accident ou une blessure ? L'ACC peut couvrir vos frais de traitement.",
    es: "¿Su visita está relacionada con un accidente o lesión? ACC podría cubrir sus costos de tratamiento.",
    ar: "هل تتعلق زيارتك بحادث أو إصابة؟ قد تغطي ACC تكاليف علاجك.",
    hi: "क्या आपकी यह मुलाकात किसी दुर्घटना या चोट से संबंधित है? ACC आपके इलाज का खर्च कवर कर सकता है।",
  },

  gp_name: {
    en: "Do you have a regular GP or family doctor? If so, what's their name?",
    mi: "He tākuta whānau tō? Ki te pēnā, ko wai tōna ingoa?", // TODO cert
    sm: "E i ai sau foma'i masani po'o le foma'i o le aiga? Afai ioe, o ai le igoa?", // TODO cert
    zh: "您有固定的家庭医生（GP）吗？如有，请告诉我他/她的名字。",
    ja: "かかりつけの医師（GP）はいますか？いる場合、お名前を教えてください。",
    ko: "정기적으로 진료받는 GP나 가정의가 있습니까? 있다면 이름이 무엇입니까?",
    de: "Haben Sie einen festen Hausarzt (GP)? Wenn ja, wie heißt er/sie?",
    nl: "Heeft u een vaste huisarts (GP)? Zo ja, wat is zijn/haar naam?",
    fr: "Avez-vous un médecin traitant (GP) régulier ? Si oui, quel est son nom ?",
    es: "¿Tiene un médico de cabecera (GP) habitual? Si es así, ¿cuál es su nombre?",
    ar: "هل لديك طبيب عام (GP) أو طبيب عائلة تراجعه بانتظام؟ إذا كان الأمر كذلك، ما اسمه؟",
    hi: "क्या आपके पास कोई नियमित जीपी या फैमिली डॉक्टर है? यदि हाँ, तो उनका नाम क्या है?",
  },

  gp_clinic: {
    en: "What's the name of their clinic or practice?",
    mi: "He aha te ingoa o tā rātou hōhipera, whare tākuta rānei?", // TODO cert
    sm: "O le a le igoa o la latou falema'i po'o le kilinika?", // TODO cert
    zh: "他们的诊所或医疗机构叫什么名字？",
    ja: "そのクリニックまたは医院の名前は何ですか？",
    ko: "그 진료소나 병원의 이름은 무엇입니까?",
    de: "Wie heißt die Praxis oder Klinik?",
    nl: "Wat is de naam van hun praktijk of kliniek?",
    fr: "Quel est le nom de leur cabinet ou clinique ?",
    es: "¿Cómo se llama su clínica o consultorio?",
    ar: "ما اسم عيادتهم أو مركزهم الطبي؟",
    hi: "उनके क्लिनिक या अभ्यास का नाम क्या है?",
  },

  gp_confirm: {
    en: "Found {gpName} at {gpClinic} — is that right? We'll send them a copy of your notes automatically.",
    mi: "I kitea a {gpName} i {gpClinic} — he tika tērā? Ka tukua atu he tārua o ō tuhinga ki a rātou.", // TODO cert
    sm: "Ua maua {gpName} i {gpClinic} — e sa'o le lea? O le a matou lafo atu se kopi o au fa'amaumauga.", // TODO cert
    zh: "找到了 {gpName} 在 {gpClinic} — 对吗？我们会自动将您的记录副本发送给他们。",
    ja: "{gpClinic} の {gpName} 先生ですね — 合っていますか？診療記録のコピーを自動的にお送りします。",
    ko: "{gpClinic}의 {gpName}을(를) 찾았습니다 — 맞습니까? 진료 기록 사본을 자동으로 보내드립니다.",
    de: "{gpName} in {gpClinic} gefunden — stimmt das? Wir senden eine Kopie Ihrer Notizen automatisch dorthin.",
    nl: "{gpName} bij {gpClinic} gevonden — klopt dat? Wij sturen hen automatisch een kopie van uw notities.",
    fr: "Trouvé {gpName} à {gpClinic} — c'est correct ? Nous leur enverrons une copie de vos notes automatiquement.",
    es: "Encontrado {gpName} en {gpClinic} — ¿es correcto? Les enviaremos una copia de sus notas automáticamente.",
    ar: "تم العثور على {gpName} في {gpClinic} — هل هذا صحيح؟ سنرسل لهم نسخة من ملاحظاتك تلقائيًا.",
    hi: "{gpClinic} में {gpName} मिला — क्या यह सही है? हम स्वचालित रूप से आपकी नोट्स की एक प्रति उन्हें भेज देंगे।",
  },

  tobacco: {
    en: "Do you currently smoke or use tobacco?",
    mi: "Kei te momi paipa, kei te whakamahi tupeka rānei koe?", // TODO cert
    sm: "O e ulaula pe fa'aaogaina le tapaa i le taimi nei?", // TODO cert
    zh: "您目前吸烟或使用烟草吗？",
    ja: "現在、タバコを吸ったり、タバコ製品を使用したりしていますか？",
    ko: "현재 담배를 피우거나 담배 제품을 사용하십니까?",
    de: "Rauchen Sie derzeit oder konsumieren Sie Tabak?",
    nl: "Rookt u op dit moment of gebruikt u tabak?",
    fr: "Fumez-vous ou consommez-vous du tabac actuellement ?",
    es: "¿Actualmente fuma o usa tabaco?",
    ar: "هل تدخن أو تستخدم التبغ حاليًا؟",
    hi: "क्या आप वर्तमान में धूम्रपान करते हैं या तंबाकू का उपयोग करते हैं?",
  },

  tobacco_amount: {
    en: "How much would you say?",
    mi: "E hia te nui i tō whakaaro?", // TODO cert
    sm: "E fia lau manatu?", // TODO cert
    zh: "您觉得大约多少？",
    ja: "だいたいどれくらいですか？",
    ko: "얼마나 되십니까?",
    de: "Wie viel wäre das ungefähr?",
    nl: "Hoeveel zou u zeggen?",
    fr: "Combien diriez-vous ?",
    es: "¿Cuánto diría?",
    ar: "كم تقريبًا؟",
    hi: "आप कितना कहेंगे?",
  },

  alcohol: {
    en: "Do you drink alcohol?",
    mi: "Kei te inu waipiro koe?", // TODO cert
    sm: "E te inu 'ava malosi?", // TODO cert
    zh: "您喝酒吗？",
    ja: "お酒を飲みますか？",
    ko: "술을 마십니까?",
    de: "Trinken Sie Alkohol?",
    nl: "Drinkt u alcohol?",
    fr: "Buvez-vous de l'alcool ?",
    es: "¿Bebe alcohol?",
    ar: "هل تشرب الكحول؟",
    hi: "क्या आप शराब पीते हैं?",
  },

  alcohol_amount: {
    en: "Roughly how much per week?",
    mi: "E hia te nui ia wiki?", // TODO cert
    sm: "E fia i le vaiaso?", // TODO cert
    zh: "每周大约多少？",
    ja: "週にだいたいどれくらいですか？",
    ko: "일주일에 대략 얼마나 되십니까?",
    de: "Wie viel ungefähr pro Woche?",
    nl: "Ongeveer hoeveel per week?",
    fr: "À peu près combien par semaine ?",
    es: "¿Aproximadamente cuánto por semana?",
    ar: "كم تقريبًا في الأسبوع؟",
    hi: "प्रति सप्ताह लगभग कितना?",
  },

  btn_skip_arrow: {
    en: "Skip →",
    mi: "Tukua →", sm: "Preterisi →",
    zh: "跳过 →", ja: "スキップ →", ko: "건너뛰기 →",
    de: "Überspringen →", nl: "Overslaan →", fr: "Passer →", es: "Omitir →",
    ar: "تخطي ←", hi: "छोड़ें →",
  },

  btn_undo_last: {
    en: "← Undo last answer",
    mi: "← Whakakore i te whakautu whakamutunga", // TODO cert
    sm: "← Fa'aleaogaina le tali mulimuli", // TODO cert
    zh: "← 撤销上一个回答", ja: "← 前の回答を取り消す", ko: "← 마지막 답변 취소",
    de: "← Letzte Antwort rückgängig machen", nl: "← Laatste antwoord ongedaan maken", fr: "← Annuler la dernière réponse",
    es: "← Deshacer última respuesta",
    ar: "→ التراجع عن الإجابة الأخيرة", hi: "← अंतिम उत्तर पूर्ववत करें",
  },

  acc_description: {
    en: "That sounds like it could be an ACC claim — can you describe exactly how it happened? What were you doing and where?",
    mi: "He āhua ACC pea tērā — ka taea e koe te whakamārama mai me pēhea i pā ai? He aha tāu i mahi ai, i hea?", // TODO cert
    sm: "E foliga mai o se talosaga ACC lena — e mafai ona e fa'amatala pe na fa'apefea ona tupu? O le a le mea sa e faia, ma o fea?", // TODO cert
    zh: "这听起来可能是ACC索赔——您能描述一下具体是如何发生的吗？您当时在做什么，在哪里？",
    ja: "ACCの請求になる可能性がありますね。どのように起きたか詳しく教えてください。何をしていて、どこにいましたか？",
    ko: "ACC 청구가 될 수 있을 것 같습니다 — 어떻게 일어났는지 정확히 설명해 주시겠습니까? 무엇을 하고 있었고 어디에 있었습니까?",
    de: "Das könnte ein ACC-Anspruch sein — können Sie genau beschreiben, wie es passiert ist? Was haben Sie gemacht und wo?",
    nl: "Dat zou een ACC-claim kunnen zijn — kunt u precies beschrijven hoe het is gebeurd? Wat was u aan het doen en waar?",
    fr: "Cela pourrait être une demande ACC — pouvez-vous décrire exactement comment c'est arrivé ? Que faisiez-vous et où ?",
    es: "Eso podría ser una reclamación de ACC — ¿puede describir exactamente cómo ocurrió? ¿Qué estaba haciendo y dónde?",
    ar: "يبدو أن هذا يمكن أن يكون مطالبة ACC — هل يمكنك وصف كيف حدث بالضبط؟ ماذا كنت تفعل وأين؟",
    hi: "यह एक ACC दावा हो सकता है — क्या आप बिल्कुल बता सकते हैं कि यह कैसे हुआ? आप क्या कर रहे थे और कहाँ थे?",
  },
  acc_description_error: {
    en: "Can you describe how it happened?",
    mi: "Ka taea e koe te whakamārama me pēhea i pā ai?", // TODO cert
    sm: "E mafai ona e fa'amatala pe na fa'apefea ona tupu?", // TODO cert
    zh: "您能描述一下是怎么发生的吗？",
    ja: "どのように起きたか教えてください。",
    ko: "어떻게 일어났는지 설명해 주시겠습니까?",
    de: "Können Sie beschreiben, wie es passiert ist?",
    nl: "Kunt u beschrijven hoe het is gebeurd?",
    fr: "Pouvez-vous décrire comment c'est arrivé ?",
    es: "¿Puede describir cómo ocurrió?",
    ar: "هل يمكنك وصف كيف حدث ذلك؟",
    hi: "क्या आप बता सकते हैं कि यह कैसे हुआ?",
  },

  acc_date: {
    en: "When did it happen? (e.g. today, yesterday, 3 days ago)",
    mi: "Nō nāhea tēnei i pā ai? (hei tauira: i tēnei rā, inanahi, 3 rā ki muri)", // TODO cert
    sm: "O anafea na tupu ai? (fa'ata'ita'iga: aso nei, ananafi, 3 aso talu ai)", // TODO cert
    zh: "这是什么时候发生的？（例如：今天、昨天、3天前）",
    ja: "いつ起きましたか？（例：今日、昨日、3日前）",
    ko: "언제 일어났습니까? (예: 오늘, 어제, 3일 전)",
    de: "Wann ist es passiert? (z.B. heute, gestern, vor 3 Tagen)",
    nl: "Wanneer is het gebeurd? (bijv. vandaag, gisteren, 3 dagen geleden)",
    fr: "Quand est-ce arrivé ? (ex. aujourd'hui, hier, il y a 3 jours)",
    es: "¿Cuándo ocurrió? (ej. hoy, ayer, hace 3 días)",
    ar: "متى حدث ذلك؟ (مثلاً: اليوم، أمس، منذ 3 أيام)",
    hi: "यह कब हुआ? (जैसे: आज, कल, 3 दिन पहले)",
  },

  acc_employer: {
    en: "Who's your employer?",
    mi: "Ko wai tō kaituku mahi?", // TODO cert
    sm: "O ai le kamupani e te faigaluega ai?", // TODO cert
    zh: "您的雇主是谁？",
    ja: "雇用主はどなたですか？",
    ko: "고용주가 누구입니까?",
    de: "Wer ist Ihr Arbeitgeber?",
    nl: "Wie is uw werkgever?",
    fr: "Qui est votre employeur ?",
    es: "¿Quién es su empleador?",
    ar: "من هو صاحب العمل الخاص بك؟",
    hi: "आपके नियोक्ता कौन हैं?",
  },

  photo: {
    en: "Can you take a photo of the affected area? Tap the camera icon — it really helps the doctor. Or type skip.",
    mi: "Ka taea e koe te tango whakaahua o te wāhi mate? Pāwhiritia te tohu kāmera — he tino āwhina tērā mō te rata. Me tāpiri rānei 'tukua'.", // TODO cert
    sm: "E mafai ona e pu'e se ata o le vaega e tiga? O'omi le tama'i ata o le meapu'e ata — e fesoasoani tele i le foma'i. Pe tusia 'preterisi'.", // TODO cert
    zh: "您能拍一张患处的照片吗？点击相机图标——对医生很有帮助。或者输入「跳过」。",
    ja: "患部の写真を撮ってもらえますか？カメラアイコンをタップしてください — 医師の診断にとても役立ちます。スキップと入力してもOKです。",
    ko: "영향을 받은 부위의 사진을 찍어 주시겠습니까? 카메라 아이콘을 탭하세요 — 의사에게 매우 도움이 됩니다. 또는 '건너뛰기'를 입력하세요.",
    de: "Können Sie ein Foto des betroffenen Bereichs machen? Tippen Sie auf das Kamerasymbol — das hilft dem Arzt wirklich. Oder geben Sie 'weiter' ein.",
    nl: "Kunt u een foto maken van het betrokken gebied? Tik op het camerapictogram — dat helpt de arts echt. Of typ 'overslaan'.",
    fr: "Pouvez-vous prendre une photo de la zone touchée ? Appuyez sur l'icône de la caméra — ça aide vraiment le médecin. Ou tapez 'ignorer'.",
    es: "¿Puede tomar una foto del área afectada? Toque el ícono de la cámara — realmente ayuda al médico. O escriba 'omitir'.",
    ar: "هل يمكنك التقاط صورة للمنطقة المصابة؟ اضغط على أيقونة الكاميرا — إنها تساعد الطبيب كثيراً. أو اكتب 'تخطي'.",
    hi: "क्या आप प्रभावित क्षेत्र की फोटो ले सकते हैं? कैमरा आइकन दबाएं — यह डॉक्टर को वास्तव में मदद करता है। या 'छोड़ें' टाइप करें।",
  },

  recording: {
    en: "One more thing — do you consent to your consultation being AI-transcribed? The recording is deleted straight after.",
    mi: "Kotahi anō mea — kei te whakaae koe kia tuhia tō tirohanga e te AI? Ka mukua te rīpene i muri tonu.", // TODO cert
    sm: "Toe tasi le mea — e te malie e tusia lau asiasiga e le AI? E soloi ese le pu'ega ina ua uma.", // TODO cert
    zh: "最后一个问题——您是否同意对您的会诊进行AI转录？录音会在之后立即删除。",
    ja: "最後です — 診察のAI文字起こしに同意しますか？録音はすぐに削除されます。",
    ko: "마지막으로 — 상담을 AI로 녹취하는 것에 동의하십니까? 녹음은 바로 삭제됩니다.",
    de: "Letzte Frage — stimmen Sie der KI-Transkription Ihrer Konsultation zu? Die Aufnahme wird danach sofort gelöscht.",
    nl: "Nog één ding — geeft u toestemming dat uw consult door AI wordt uitgeschreven? De opname wordt direct daarna verwijderd.",
    fr: "Dernière question — consentez-vous à la transcription par IA de votre consultation ? L'enregistrement est supprimé juste après.",
    es: "Última pregunta — ¿consiente que su consulta sea transcrita por IA? La grabación se elimina inmediatamente después.",
    ar: "السؤال الأخير — هل توافق على نسخ استشارتك بالذكاء الاصطناعي؟ يُحذف التسجيل مباشرة بعد ذلك.",
    hi: "अंतिम प्रश्न — क्या आप अपनी परामर्श को AI द्वारा ट्रांसक्राइब करने की सहमति देते हैं? रिकॉर्डिंग तुरंत बाद हटा दी जाती है।",
  },

  // ── Triage flow messages ──────────────────────────────────────────────────
  sweet_as: {
    en: "Sweet as! I've got everything I need — setting you up now...",
    mi: "Ka pai! Kua whiwhi au i ngā mea katoa — kei te whakarite ināianei...", // TODO cert
    sm: "Manaia! Ua ou maua mea uma sa manaomia — o lo'o fa'atulaga nei oe...", // TODO cert
    zh: "太好了！我已经获得了所需的一切——正在为您设置……",
    ja: "完璧です！必要なものがすべて揃いました — 今すぐ設定します...",
    ko: "완벽합니다! 필요한 모든 것을 갖췄습니다 — 지금 설정 중입니다...",
    de: "Super! Ich habe alles, was ich brauche — richte Sie jetzt ein...",
    nl: "Prima! Ik heb alles wat ik nodig heb — ik zet het nu voor u klaar...",
    fr: "Parfait ! J'ai tout ce qu'il me faut — je vous configure maintenant...",
    es: "¡Perfecto! Tengo todo lo que necesito — configurándolo ahora...",
    ar: "ممتاز! لدي كل ما أحتاجه — إعداد حسابك الآن...",
    hi: "बहुत अच्छा! मुझे सब कुछ मिल गया — अभी आपको सेट अप कर रहा हूँ...",
  },
  welcome_back: {
    en: "Welcome back, ${firstName}! I've got your details — let's get you sorted.",
    mi: "Nau mai anō, ${firstName}! Kua whiwhi au i ō kōrero — me whakatika tāua.", // TODO cert
    sm: "Talofa mai fo'i, ${firstName}! Ua ou maua au fa'amatalaga — ta fai lena mea nei.", // TODO cert
    zh: "欢迎回来，${firstName}！我已经有您的信息了——让我们来解决您的问题。",
    ja: "おかえりなさい、${firstName}さん！詳細を確認しました — すぐに対応します。",
    ko: "다시 오셨군요, ${firstName}님! 정보를 확인했습니다 — 바로 도와드리겠습니다.",
    de: "Willkommen zurück, ${firstName}! Ich habe Ihre Daten — lassen Sie uns das klären.",
    nl: "Welkom terug, ${firstName}! Ik heb uw gegevens — laten we u helpen.",
    fr: "Bon retour, ${firstName} ! J'ai vos informations — réglons ça.",
    es: "¡Bienvenido de nuevo, ${firstName}! Tengo sus datos — vamos a solucionarlo.",
    ar: "مرحباً بعودتك، ${firstName}! لدي تفاصيلك — لنحل هذا.",
    hi: "वापस स्वागत है, ${firstName}! मुझे आपकी जानकारी मिल गई — चलिए इसे ठीक करते हैं।",
  },
  cheers_photo: {
    en: "Cheers! The doctor will be able to see those.",
    mi: "Ngā mihi! Ka taea e te rata te tiro atu ki ērā.", // TODO cert
    sm: "Fa'afetai! O le a mafai e le foma'i ona va'ai i na mea.", // TODO cert
    zh: "谢谢！医生将能看到这些照片。",
    ja: "ありがとうございます！医師が確認できます。",
    ko: "감사합니다! 의사가 확인할 수 있습니다.",
    de: "Danke! Der Arzt wird das sehen können.",
    nl: "Bedankt! De arts zal ze kunnen bekijken.",
    fr: "Merci ! Le médecin pourra les voir.",
    es: "¡Gracias! El médico podrá verlas.",
    ar: "شكراً! سيتمكن الطبيب من رؤيتها.",
    hi: "धन्यवाद! डॉक्टर उन्हें देख पाएंगे।",
  },
  clinic_closed_suffix: {
    en: " Just so you know, our doctor isn't available right now — but go ahead and fill in your details and we'll hold your spot at the front of the queue. You'll get an email as soon as they're available.",
    mi: " Kia mōhio mai koe, kāore tō mātou rata e wātea ana ināianei — engari haere tonu, whakakīa ō kōrero ā, ka pupuri mātou i tō tūranga ki mua o te rārangi. Ka whiwhi koe i tētahi īmēra ina wātea mai ia.", // TODO cert
    sm: " Ia e iloa, e le'o avanoa la matou foma'i i le taimi nei — ae fa'aauau pea ma tusi au fa'amatalaga ma o le a matou taofia lou nofoaga i luma o le lisi. E te maua se imeli i le taimi lava e avanoa ai.", // TODO cert
    zh: " 请注意，我们的医生目前不可用——请继续填写您的信息，我们将为您保留排队前位。医生一旦有空，您将收到电子邮件通知。",
    ja: " なお、現在担当医が対応できない状況ですが、詳細を入力していただければ順番待ちリストの先頭にお名前を確保します。担当医が対応可能になり次第、メールでお知らせします。",
    ko: " 참고로, 현재 의사가 없습니다 — 하지만 정보를 입력하시면 대기열 앞자리를 보장해 드립니다. 의사가 가능해지는 즉시 이메일로 알려드리겠습니다.",
    de: " Zu Ihrer Information: Unser Arzt ist gerade nicht verfügbar — füllen Sie einfach Ihre Daten aus, und wir halten Ihnen einen Platz am Anfang der Warteschlange frei. Sie erhalten eine E-Mail, sobald er verfügbar ist.",
    nl: " Ter informatie: onze arts is op dit moment niet beschikbaar — maar vul gerust uw gegevens in en wij houden uw plek vooraan in de wachtrij. U ontvangt een e-mail zodra de arts beschikbaar is.",
    fr: " Pour information, notre médecin n'est pas disponible en ce moment — remplissez vos informations et nous vous réserverons une place en tête de file. Vous recevrez un e-mail dès qu'il sera disponible.",
    es: " Para su información, nuestro médico no está disponible ahora mismo — continúe con sus datos y le guardaremos el lugar al frente de la cola. Recibirá un correo electrónico en cuanto esté disponible.",
    ar: " فقط لمعلوماتك، طبيبنا غير متاح الآن — لكن استمر في إدخال تفاصيلك وسنحتفظ بمكانك في مقدمة الطابور. ستتلقى بريداً إلكترونياً بمجرد توفره.",
    hi: " बस आपको बता दें, हमारे डॉक्टर अभी उपलब्ध नहीं हैं — लेकिन आगे बढ़ें और अपनी जानकारी भरें, हम कतार में आपकी जगह आरक्षित करेंगे। जैसे ही वे उपलब्ध होंगे, आपको ईमेल मिलेगा।",
  },
  generic_error: {
    en: "Can you try that again?",
    mi: "Ka taea e koe te whakamātau anō?", // TODO cert
    sm: "E mafai ona e toe taumafai?", // TODO cert
    zh: "您能再试一次吗？",
    ja: "もう一度お試しください。",
    ko: "다시 시도해 주세요.",
    de: "Können Sie das nochmals versuchen?",
    nl: "Kunt u dat nog eens proberen?",
    fr: "Pouvez-vous réessayer ?",
    es: "¿Puede intentarlo de nuevo?",
    ar: "هل يمكنك المحاولة مرة أخرى؟",
    hi: "क्या आप फिर से कोशिश कर सकते हैं?",
  },

  // ── Yes/No buttons ────────────────────────────────────────────────────────
  yes_label: {
    en: 'Yes', mi: 'Āe', sm: 'Ioe', zh: '是', ja: 'はい', ko: '예',
    de: 'Ja', nl: 'Ja', fr: 'Oui', es: 'Sí', ar: 'نعم', hi: 'हाँ',
  },
  no_label: {
    en: 'No', mi: 'Kāo', sm: 'Leai', zh: '否', ja: 'いいえ', ko: '아니요',
    de: 'Nein', nl: 'Nee', fr: 'Non', es: 'No', ar: 'لا', hi: 'नहीं',
  },

  // ── Emergency screens ─────────────────────────────────────────────────────
  physical_heading: {
    en: 'Call 111 Now',
    mi: 'Waea atu ki te 111 ināianei',
    sm: 'Vala\'au le 111 i le taimi nei', // TODO cert
    zh: '立即拨打111',
    ja: '今すぐ111に電話',
    ko: '지금 111에 전화',
    de: 'Jetzt 111 anrufen',
    nl: 'Bel nu 111',
    fr: 'Appelez le 111 maintenant',
    es: 'Llame al 111 ahora',
    ar: 'اتصل بـ 111 الآن',
    hi: 'अभी 111 पर कॉल करें',
  },
  physical_body: {
    en: 'Your symptoms need immediate emergency care. Please call 111 right now.',
    mi: 'Me hui atu koe ki te whare hauora ināianei tonu. Waea atu ki te 111 ināianei.', // TODO cert
    sm: 'O ou fa\'ailoga e mana\'omia le va\'aiga fa\'afuase\'i. Fa\'amolemole vala\'au le 111 i le taimi nei.', // TODO cert
    zh: '您的症状需要立即急救护理。请立即拨打111。',
    ja: 'あなたの症状は緊急医療処置が必要です。今すぐ111に電話してください。',
    ko: '귀하의 증상에는 즉각적인 응급 치료가 필요합니다. 지금 바로 111에 전화하세요.',
    de: 'Ihre Symptome erfordern sofortige Notfallversorgung. Bitte rufen Sie jetzt 111 an.',
    nl: 'Uw symptomen vereisen onmiddellijke spoedeisende zorg. Bel nu direct 111.',
    fr: 'Vos symptômes nécessitent des soins d\'urgence immédiats. Veuillez appeler le 111 maintenant.',
    es: 'Sus síntomas requieren atención de emergencia inmediata. Por favor llame al 111 ahora.',
    ar: 'أعراضك تحتاج إلى رعاية طارئة فورية. يرجى الاتصال بـ 111 الآن.',
    hi: 'आपके लक्षणों को तत्काल आपातकालीन देखभाल की आवश्यकता है। कृपया अभी 111 पर कॉल करें।',
  },
  physical_back: {
    en: 'This was a mistake — go back',
    mi: 'He hē tēnei — hoki atu', // TODO cert
    sm: 'O se mea sese lena — toe fo\'i i tua', // TODO cert
    zh: '这是个错误——返回',
    ja: '間違えました — 戻る',
    ko: '잘못 입력했습니다 — 돌아가기',
    de: 'Das war ein Fehler — zurück',
    nl: 'Dit was een vergissing — ga terug',
    fr: 'C\'était une erreur — retour',
    es: 'Fue un error — volver',
    ar: 'كان هذا خطأ — رجوع',
    hi: 'यह गलती थी — वापस जाएं',
  },
  mental_heading: {
    en: "You don't have to face this alone",
    mi: 'Kāore he take kia noho koe kotahi ki tēnei', // TODO cert
    sm: 'E le tatau ona e feagai ma lenei mea na o oe', // TODO cert
    zh: '您不必独自面对这一切',
    ja: '一人で抱え込まないでください',
    ko: '혼자 감당하지 않아도 됩니다',
    de: 'Sie müssen das nicht alleine bewältigen',
    nl: 'U hoeft dit niet alleen te doorstaan',
    fr: 'Vous n\'avez pas à faire face à cela seul',
    es: 'No tiene que enfrentar esto solo',
    ar: 'لست وحدك في مواجهة هذا',
    hi: 'आपको यह अकेले सहन नहीं करना है',
  },
  mental_body: {
    en: "What you're feeling matters. Please reach out to someone who can really help right now.",
    mi: 'He tino nui tō e rongo ana. Tēnā, whakapā atu ki tētahi ka taea te āwhina i a koe ināianei tonu.', // TODO cert
    sm: 'O lou lagona e taua. Fa\'amolemole feso\'ota\'i ma se tasi e mafai ona fesoasoani moni i lenei taimi.', // TODO cert
    zh: '您的感受很重要。请立即联系能真正帮助您的人。',
    ja: 'あなたの気持ちは大切です。今すぐ本当に助けてくれる人に連絡してください。',
    ko: '당신이 느끼는 것이 중요합니다. 지금 당장 정말로 도움을 줄 수 있는 사람에게 연락하세요.',
    de: 'Was Sie fühlen, ist wichtig. Bitte wenden Sie sich jetzt an jemanden, der wirklich helfen kann.',
    nl: 'Wat u voelt is belangrijk. Neem alstublieft contact op met iemand die u nu echt kan helpen.',
    fr: 'Ce que vous ressentez a de l\'importance. Contactez quelqu\'un qui peut vraiment vous aider maintenant.',
    es: 'Lo que sientes importa. Por favor comunícate con alguien que pueda ayudarte de verdad ahora.',
    ar: 'ما تشعر به مهم. يرجى التواصل مع شخص يمكنه مساعدتك حقاً الآن.',
    hi: 'आप जो महसूस कर रहे हैं वह महत्वपूर्ण है। कृपया अभी किसी से संपर्क करें जो वास्तव में मदद कर सके।',
  },
  emergency_danger: {
    en: 'If you are in immediate danger, call 111',
    mi: 'Mēnā kei roto koe i te tino kino, waea atu ki te 111',
    sm: 'A fai o lo\'o e i ai i se tulaga lamatia fa\'afuase\'i, vala\'au le 111', // TODO cert
    zh: '如果您面临立即危险，请拨打111',
    ja: 'すぐに危険な状況にある場合は111に電話してください',
    ko: '즉각적인 위험에 처해 있다면 111에 전화하세요',
    de: 'Wenn Sie in unmittelbarer Gefahr sind, rufen Sie 111 an',
    nl: 'Als u in direct gevaar bent, bel dan 111',
    fr: 'Si vous êtes en danger immédiat, appelez le 111',
    es: 'Si está en peligro inmediato, llame al 111',
    ar: 'إذا كنت في خطر فوري، اتصل بـ 111',
    hi: 'अगर आप तत्काल खतरे में हैं, तो 111 पर कॉल करें',
  },
  addiction_heading: {
    en: 'Help is available',
    mi: 'He āwhina kei te wātea', // TODO cert
    sm: 'O lo\'o avanoa le fesoasoani', // TODO cert
    zh: '帮助就在眼前',
    ja: 'サポートを受けられます',
    ko: '도움을 받을 수 있습니다',
    de: 'Hilfe ist verfügbar',
    nl: 'Er is hulp beschikbaar',
    fr: 'De l\'aide est disponible',
    es: 'Hay ayuda disponible',
    ar: 'المساعدة متاحة',
    hi: 'मदद उपलब्ध है',
  },
  addiction_body: {
    en: 'Reaching out takes courage. These services are free, confidential, and ready to help.',
    mi: 'He māia te whakapā atu. He kore utu ēnei ratonga, he muna, ā, kua rite ki te āwhina.', // TODO cert
    sm: 'E mana\'omia le lototetele e feso\'ota\'i ai. O nei auaunaga e leai se totogi, e fa\'alilolilo, ma sauni e fesoasoani.', // TODO cert
    zh: '寻求帮助需要勇气。这些服务免费、保密，随时准备好帮助您。',
    ja: '助けを求めることには勇気が必要です。これらのサービスは無料で、秘密が守られ、いつでもサポートします。',
    ko: '도움을 요청하는 것은 용기가 필요합니다. 이 서비스들은 무료이고 비밀이 보장되며 도움을 줄 준비가 되어 있습니다.',
    de: 'Sich Hilfe zu holen braucht Mut. Diese Dienste sind kostenlos, vertraulich und bereit zu helfen.',
    nl: 'Om hulp vragen vereist moed. Deze diensten zijn gratis, vertrouwelijk en klaar om u te helpen.',
    fr: 'Demander de l\'aide demande du courage. Ces services sont gratuits, confidentiels et prêts à vous aider.',
    es: 'Pedir ayuda requiere valentía. Estos servicios son gratuitos, confidenciales y listos para ayudar.',
    ar: 'يتطلب طلب المساعدة شجاعة. هذه الخدمات مجانية وسرية وجاهزة للمساعدة.',
    hi: 'मदद माँगने के लिए साहस चाहिए। ये सेवाएं मुफ्त, गोपनीय और मदद के लिए तैयार हैं।',
  },

  // ── Chat / translation ────────────────────────────────────────────────────
  translation_disclaimer: {
    en: 'Translations are provided as assistance only. For complex medical discussions, a professional interpreter is recommended.',
    mi: 'Ka whakaratohia ngā whakamāoritanga hei āwhina noa. Mō ngā kōrero hauora uaua, e tūtohutia ana kia whakamahia tētahi kaiwhakamāori mātanga.', // TODO cert
    sm: 'O fa\'aliliuga ua na\'o le fesoasoani. Mo talanoaga fa\'afoma\'i faigata, e fa\'amaonia le fa\'aaogaina o se fa\'aliliu upu fa\'apolofesa.', // TODO cert
    zh: '翻译仅作参考。对于复杂的医疗讨论，建议使用专业口译员。',
    ja: '翻訳はサポートとして提供されています。複雑な医療相談には専門の通訳者をお勧めします。',
    ko: '번역은 보조 용도로만 제공됩니다. 복잡한 의료 상담의 경우 전문 통역사가 권장됩니다.',
    de: 'Übersetzungen dienen nur als Unterstützung. Für komplexe medizinische Gespräche wird ein professioneller Dolmetscher empfohlen.',
    nl: 'Vertalingen worden alleen als hulpmiddel aangeboden. Voor complexe medische gesprekken wordt een professionele tolk aanbevolen.',
    fr: 'Les traductions sont fournies à titre d\'aide seulement. Pour les discussions médicales complexes, un interprète professionnel est recommandé.',
    es: 'Las traducciones se proporcionan solo como asistencia. Para discusiones médicas complejas, se recomienda un intérprete profesional.',
    ar: 'تُقدَّم الترجمات كمساعدة فقط. للمناقشات الطبية المعقدة، يُوصى بمترجم متخصص.',
    hi: 'अनुवाद केवल सहायता के रूप में प्रदान किए जाते हैं। जटिल चिकित्सा चर्चाओं के लिए एक पेशेवर दुभाषिया अनुशंसित है।',
  },
  show_original: {
    en: 'Show original', mi: 'Whakaatu i te taketake', sm: 'Fa\'aali le mea muamua', zh: '显示原文', ja: '原文を表示', ko: '원문 보기',
    de: 'Original anzeigen', nl: 'Origineel tonen', fr: 'Voir l\'original', es: 'Ver original', ar: 'عرض الأصل', hi: 'मूल दिखाएं',
  },
  hide_original: {
    en: 'Hide', mi: 'Huna', sm: 'Natia', zh: '隐藏', ja: '非表示', ko: '숨기기',
    de: 'Ausblenden', nl: 'Verbergen', fr: 'Masquer', es: 'Ocultar', ar: 'إخفاء', hi: 'छुपाएं',
  },
  translating: {
    en: 'Translating…', mi: 'Kei te whakamāori…', sm: 'Fa\'aliliuina…', zh: '翻译中…', ja: '翻訳中…', ko: '번역 중…',
    de: 'Übersetzen…', nl: 'Vertalen…', fr: 'Traduction…', es: 'Traduciendo…', ar: 'جارٍ الترجمة…', hi: 'अनुवाद हो रहा है…',
  },
  chat_label: {
    en: 'Chat', mi: 'Kōrero', sm: 'Talanoa', zh: '聊天', ja: 'チャット', ko: '채팅',
    de: 'Chat', nl: 'Chat', fr: 'Chat', es: 'Chat', ar: 'دردشة', hi: 'चैट',
  },

  // ── TereIntro ─────────────────────────────────────────────────────────────
  choose_language: {
    en: 'Choose your language', mi: 'Kōwhiria tō reo', sm: 'Filifili lau gagana', zh: '选择语言', ja: '言語を選択', ko: '언어 선택',
    de: 'Sprache wählen', nl: 'Kies uw taal', fr: 'Choisir la langue', es: 'Elige tu idioma', ar: 'اختر لغتك', hi: 'अपनी भाषा चुनें',
  },
  get_started: {
    en: 'Get started →', mi: 'Tīmata →', sm: 'Amata →', zh: '开始 →', ja: '始める →', ko: '시작하기 →',
    de: 'Loslegen →', nl: 'Beginnen →', fr: 'Commencer →', es: 'Comenzar →', ar: 'ابدأ ←', hi: 'शुरू करें →',
  },
  step_1: {
    en: 'Quick chat', mi: 'Kōrero poto', sm: 'Talanoaga puupuu', zh: '快速问诊', ja: 'クイック問診', ko: '빠른 상담',
    de: 'Kurzes Gespräch', nl: 'Kort gesprek', fr: 'Chat rapide', es: 'Chat rápido', ar: 'دردشة سريعة', hi: 'त्वरित चैट',
  },
  step_2: {
    en: 'Vitals scan', mi: 'Matawai ora', sm: 'Su\'ega o le tino', zh: '体征扫描', ja: 'バイタル測定', ko: '활력징후 측정',
    de: 'Vitalwerte', nl: 'Vitale functies', fr: 'Bilan santé', es: 'Signos vitales', ar: 'قياس الحيوية', hi: 'वाइटल स्कैन',
  },
  step_3: {
    en: 'See doctor', mi: 'Kite rata', sm: 'Va\'ai i le foma\'i', zh: '看医生', ja: '医師に診てもらう', ko: '의사 진찰',
    de: 'Arzt sehen', nl: 'Arts spreken', fr: 'Voir le médecin', es: 'Ver al médico', ar: 'رؤية الطبيب', hi: 'डॉक्टर से मिलें',
  },
  step_4: {
    en: 'Get sorted', mi: 'Whakatikahia', sm: 'Fa\'atulaga', zh: '获得诊治', ja: '治療を受ける', ko: '해결하기',
    de: 'Behandlung', nl: 'Geholpen worden', fr: 'Être soigné', es: 'Resolver', ar: 'الحصول على الحل', hi: 'समाधान पाएं',
  },

  // ── Prescribing limitations gate ─────────────────────────────────────────
  prescribing_gate_intro: {
    en: 'Before we begin',
    mi: 'I mua i tā tāua tīmatanga', // TODO cert
    sm: 'A\'o le\'i amata', // TODO cert
    zh: '开始之前',
    ja: '始める前に',
    ko: '시작하기 전에',
    de: 'Bevor wir beginnen',
    nl: 'Voordat we beginnen',
    fr: 'Avant de commencer',
    es: 'Antes de comenzar',
    ar: 'قبل أن نبدأ',
    hi: 'शुरू करने से पहले',
  },
  prescribing_gate_title: {
    en: 'What Tere Health can and cannot prescribe',
    mi: 'Ngā mea ka taea, ngā mea kāore e taea e Tere Health te tuku hei rongoā', // TODO cert
    sm: 'O mea e mafai ma le mafai e Tere Health ona tuu atu ni fualaau', // TODO cert
    zh: 'Tere Health 能开和不能开的处方',
    ja: 'Tere Health が処方できるものとできないもの',
    ko: 'Tere Health가 처방할 수 있는 것과 없는 것',
    de: 'Was Tere Health verschreiben kann und was nicht',
    nl: 'Wat Tere Health wel en niet kan voorschrijven',
    fr: 'Ce que Tere Health peut et ne peut pas prescrire',
    es: 'Lo que Tere Health puede y no puede recetar',
    ar: 'ما يمكن وما لا يمكن لـ Tere Health وصفه',
    hi: 'Tere Health क्या लिख सकता है और क्या नहीं',
  },
  prescribing_gate_body: {
    en: 'Tere Health doctors can prescribe many common medications via telehealth. However, New Zealand law places restrictions on certain controlled drugs and medications requiring specialist oversight. Please read and acknowledge the following before continuing.',
    mi: 'Ka taea e ngā rata o Tere Health te tuku i te maha o ngā rongoā noa mā te telehealth. Heoi anō, e whakatakoto ana te ture o Aotearoa i ngā herenga mō ētahi rongoā whakahaere me ngā rongoā me tirotiro e te mātanga. Tēnā, pānuihia me whakaae ki ngā mea e whai ake nei i mua i te haere tonu.', // TODO cert
    sm: 'E mafai e foma\'i o Tere Health ona tu\'uina atu le tele o fualaau masani e ala i le telehealth. Peita\'i, e i ai tulafono a Niu Sila e fa\'atapula\'a ai nisi fualaau fa\'atonutonuina ma fualaau e mana\'omia ai le va\'ava\'aiga a se foma\'i fa\'apitoa. Fa\'amolemole faitau ma fa\'amaonia mea nei a\'o le\'i fa\'aauau.', // TODO cert
    zh: 'Tere Health 的医生可以通过远程医疗开具许多常见药物。但是，新西兰法律对某些受管制药物和需要专科监督的药物有限制。请在继续之前阅读并确认以下内容。',
    ja: 'Tere Healthの医師はテレヘルスを通じて多くの一般的な薬を処方できます。ただし、ニュージーランドの法律により、一部の規制薬物および専門家の監督を必要とする薬物には制限があります。続ける前に以下をお読みになり、確認してください。',
    ko: 'Tere Health 의사들은 원격 진료를 통해 많은 일반 의약품을 처방할 수 있습니다. 그러나 뉴질랜드 법률은 특정 규제 약물 및 전문가 감독이 필요한 약물에 제한을 두고 있습니다. 계속하기 전에 다음 내용을 읽고 확인해 주세요.',
    de: 'Tere-Health-Ärzte können viele gängige Medikamente über Telemedizin verschreiben. Das neuseeländische Recht setzt jedoch bestimmten Betäubungsmitteln und Medikamenten, die eine fachärztliche Überwachung erfordern, Grenzen. Bitte lesen und bestätigen Sie Folgendes, bevor Sie fortfahren.',
    nl: 'Artsen van Tere Health kunnen veel gangbare medicijnen voorschrijven via telezorg. De Nieuw-Zeelandse wet stelt echter beperkingen aan bepaalde gereguleerde middelen en medicijnen die specialistisch toezicht vereisen. Lees en bevestig het volgende voordat u verdergaat.',
    fr: 'Les médecins de Tere Health peuvent prescrire de nombreux médicaments courants via la télémédecine. Cependant, la loi néo-zélandaise impose des restrictions sur certains médicaments contrôlés et ceux nécessitant une surveillance spécialisée. Veuillez lire et accepter ce qui suit avant de continuer.',
    es: 'Los médicos de Tere Health pueden recetar muchos medicamentos comunes mediante telemedicina. Sin embargo, la ley de Nueva Zelanda impone restricciones sobre ciertos medicamentos controlados y los que requieren supervisión especializada. Por favor lea y confirme lo siguiente antes de continuar.',
    ar: 'يمكن لأطباء Tere Health وصف كثير من الأدوية الشائعة عبر الرعاية الصحية عن بُعد. غير أن القانون النيوزيلندي يفرض قيوداً على بعض الأدوية الخاضعة للرقابة والأدوية التي تستلزم إشراف أخصائي. يرجى قراءة ما يلي والإقرار به قبل المتابعة.',
    hi: 'Tere Health के डॉक्टर टेलीहेल्थ के माध्यम से कई सामान्य दवाएं लिख सकते हैं। हालांकि, न्यूज़ीलैंड कानून कुछ नियंत्रित दवाओं और विशेषज्ञ निगरानी की आवश्यकता वाली दवाओं पर प्रतिबंध लगाता है। कृपया जारी रखने से पहले निम्नलिखित पढ़ें और स्वीकार करें।',
  },
  prescribing_gate_checkbox: {
    en: 'I understand that Tere Health cannot prescribe controlled drugs (opioids, benzodiazepines, stimulants) or GLP-1 weight loss injections (Ozempic/Wegovy) via telehealth, and I will see my GP or a specialist for these.',
    mi: 'Kei te mārama ahau kāore e taea e Tere Health te tuku i ngā rongoā whakahaere (opioids, benzodiazepines, stimulants) me ngā werohanga GLP-1 mō te ngaronga taumaha (Ozempic/Wegovy) mā te telehealth, ā, ka haere ahau ki tōku GP, ki tētahi mātanga rānei mō ēnei mea.', // TODO cert
    sm: 'Ou te malamalama e le mafai e Tere Health ona tuu atu fualaau fa\'atonutonuina (opioids, benzodiazepines, fualaau fa\'ao\'e) po\'o tui GLP-1 mo le fa\'aitiitia o le mamafa (Ozempic/Wegovy) e ala i le telehealth, ma o le a ou va\'ai i lo\'u GP po\'o se foma\'i fa\'apitoa mo nei mea.', // TODO cert
    zh: '我理解 Tere Health 不能通过远程医疗开具管制药物（阿片类药物、苯二氮䓬类药物、兴奋剂）或 GLP-1 减重注射剂（Ozempic/Wegovy），如需这些药物，我将去看全科医生或专科医生。',
    ja: 'Tere Healthはテレヘルスを通じて規制薬物（オピオイド、ベンゾジアゼピン、覚醒剤）やGLP-1体重減少注射（Ozempic/Wegovy）を処方できないことを理解しており、これらが必要な場合はかかりつけ医または専門医を受診します。',
    ko: 'Tere Health는 원격 진료를 통해 규제 약물(오피오이드, 벤조디아제핀, 자극제) 또는 GLP-1 체중 감량 주사(Ozempic/Wegovy)를 처방할 수 없으며, 이러한 약물이 필요한 경우 GP나 전문의를 방문하겠음을 이해합니다.',
    de: 'Ich verstehe, dass Tere Health über Telemedizin keine Betäubungsmittel (Opioide, Benzodiazepine, Stimulanzien) oder GLP-1-Gewichtsabnahmespritzen (Ozempic/Wegovy) verschreiben kann und ich für diese Medikamente meinen Hausarzt oder einen Spezialisten aufsuchen werde.',
    nl: 'Ik begrijp dat Tere Health via telezorg geen gereguleerde middelen (opioïden, benzodiazepines, stimulantia) of GLP-1-injecties voor gewichtsverlies (Ozempic/Wegovy) mag voorschrijven, en dat ik hiervoor mijn huisarts of een specialist zal raadplegen.',
    fr: 'Je comprends que Tere Health ne peut pas prescrire de médicaments contrôlés (opioïdes, benzodiazépines, stimulants) ou d\'injections amaigrissantes GLP-1 (Ozempic/Wegovy) via la télémédecine, et que je devrai consulter mon médecin généraliste ou un spécialiste pour ces médicaments.',
    es: 'Entiendo que Tere Health no puede recetar medicamentos controlados (opioides, benzodiacepinas, estimulantes) ni inyecciones para pérdida de peso GLP-1 (Ozempic/Wegovy) mediante telemedicina, y que visitaré a mi médico de cabecera o especialista para estos.',
    ar: 'أفهم أن Tere Health لا يمكنه وصف الأدوية الخاضعة للرقابة (المواد الأفيونية، البنزوديازيبينات، المنشطات) أو حقن إنقاص الوزن GLP-1 (أوزيمبيك/ويغوفي) عبر الرعاية عن بُعد، وسأتوجه إلى طبيبي العام أو أخصائي للحصول عليها.',
    hi: 'मैं समझता/समझती हूं कि Tere Health टेलीहेल्थ के माध्यम से नियंत्रित दवाएं (ओपिओइड, बेंजोडायजेपाइन, उत्तेजक) या GLP-1 वजन घटाने के इंजेक्शन (Ozempic/Wegovy) नहीं लिख सकता, और इनके लिए मैं अपने GP या विशेषज्ञ से मिलूंगा/मिलूंगी।',
  },
  prescribing_gate_button: {
    en: 'I understand — continue',
    mi: 'Kei te mārama ahau — haere tonu', // TODO cert
    sm: 'Ua ou malamalama — fa\'aauau', // TODO cert
    zh: '我理解——继续',
    ja: '理解しました——続ける',
    ko: '이해했습니다 — 계속',
    de: 'Ich verstehe — weiter',
    nl: 'Ik begrijp het — doorgaan',
    fr: 'Je comprends — continuer',
    es: 'Entiendo — continuar',
    ar: 'أفهم — متابعة',
    hi: 'मैं समझता/समझती हूं — जारी रखें',
  },
  controlled_med_notice: {
    en: "I've noted that. Just so you know — controlled medications (such as opioids, benzodiazepines, or GLP-1 injections like Ozempic) cannot be prescribed via telehealth. Your doctor will discuss what options are available for you today.",
    mi: 'Kua mārama mai ki ahau. Kia mōhio mai koe — kāore e taea te tuku i ngā rongoā whakahaere (pēnei i te opioids, benzodiazepines, i ngā werohanga GLP-1 pēnei i te Ozempic) mā te telehealth. Ka kōrero tō rata mō ngā kōwhiringa e wātea ana mō koe i tēnei rā.', // TODO cert
    sm: 'Ua ou fa\'ailoaina lena mea. Ia e iloa — o fualaau fa\'atonutonuina (e pei o opioids, benzodiazepines, po\'o tui GLP-1 e pei o Ozempic) e le mafai ona tuu atu e ala i le telehealth. O le a talanoaina e lou foma\'i ni filifiliga e avanoa mo oe i le aso nei.', // TODO cert
    zh: '我注意到了。请您知悉——管制药物（如阿片类药物、苯二氮䓬类药物或 Ozempic 等 GLP-1 注射剂）无法通过远程医疗开具处方。您的医生将与您讨论今天可用的选择。',
    ja: '承知しました。ご参考までに——オピオイド、ベンゾジアゼピン、OzempicなどのGLP-1注射といった規制薬物はテレヘルスでは処方できません。本日どのような選択肢があるかについて、担当医が説明します。',
    ko: '알겠습니다. 참고로 — 오피오이드, 벤조디아제핀, Ozempic과 같은 GLP-1 주사 등 규제 약물은 원격 진료를 통해 처방받을 수 없습니다. 의사가 오늘 이용 가능한 옵션에 대해 논의해 드릴 것입니다.',
    de: 'Ich habe das zur Kenntnis genommen. Nur zur Information — kontrollierte Medikamente (wie Opioide, Benzodiazepine oder GLP-1-Spritzen wie Ozempic) können nicht über Telemedizin verschrieben werden. Ihr Arzt wird mit Ihnen besprechen, welche Optionen heute für Sie verfügbar sind.',
    nl: 'Ik heb dat genoteerd. Ter informatie — gereguleerde medicijnen (zoals opioïden, benzodiazepines of GLP-1-injecties zoals Ozempic) kunnen niet via telezorg worden voorgeschreven. Uw arts zal met u bespreken welke opties er vandaag voor u beschikbaar zijn.',
    fr: 'J\'en ai pris note. Pour information — les médicaments contrôlés (comme les opioïdes, les benzodiazépines ou les injections GLP-1 telles qu\'Ozempic) ne peuvent pas être prescrits via la télémédecine. Votre médecin discutera des options disponibles pour vous aujourd\'hui.',
    es: 'Lo he anotado. Para que lo sepa — los medicamentos controlados (como opioides, benzodiacepinas o inyecciones GLP-1 como Ozempic) no pueden recetarse mediante telemedicina. Su médico discutirá qué opciones están disponibles para usted hoy.',
    ar: 'لقد لاحظت ذلك. فقط لمعلوماتك — لا يمكن وصف الأدوية الخاضعة للرقابة (مثل المواد الأفيونية، البنزوديازيبينات، أو حقن GLP-1 مثل أوزيمبيك) عبر الرعاية عن بُعد. سيناقش طبيبك الخيارات المتاحة لك اليوم.',
    hi: 'मैंने यह नोट कर लिया है। बस जानकारी के लिए — नियंत्रित दवाएं (जैसे ओपिओइड, बेंजोडायजेपाइन, या Ozempic जैसे GLP-1 इंजेक्शन) टेलीहेल्थ के माध्यम से नहीं लिखी जा सकतीं। आपके डॉक्टर आज आपके लिए उपलब्ध विकल्पों पर चर्चा करेंगे।',
  },

  // ── Symptom follow-ups (added for Te Reo bring-up 2026-07-04) ─────────────
  symptom_duration:  { en: 'How long have you had this problem?', mi: 'Nō nāhea tēnei raruraru?', sm: 'O le a le umi ua e maua ai lenei fa\'afitauli?', nl: 'Hoe lang heeft u dit probleem al?' },
  symptom_onset:     { en: 'When did this start?',                 mi: 'Nō nāhea tēnei i tīmata ai?', sm: 'O anafea na amata ai lenei mea?', nl: 'Wanneer is dit begonnen?' },
  symptom_pain:      { en: 'How severe is your pain? (1-10)',       mi: 'E hia te kaha o tō mamae? (1-10)', sm: 'O le a le tuga o lou tiga? (1-10)', nl: 'Hoe erg is uw pijn? (1-10)' },
  symptom_chest:     { en: 'Do you have chest pain?',               mi: 'He mamae ō uma?', sm: 'E te tiga i le fatafata?', nl: 'Heeft u pijn op de borst?' },
  symptom_breathing: { en: 'Are you having trouble breathing?',     mi: 'He uaua tō manawa?', sm: 'E te faigata ona manava?', nl: 'Heeft u moeite met ademhalen?' },
  symptom_dizzy:     { en: 'Do you feel dizzy?',                    mi: 'He amuamu tō mātenga?', sm: 'E te lagona le niniva?', nl: 'Voelt u zich duizelig?' },
  symptom_vomit:     { en: 'Have you vomited?',                     mi: 'Kua ruaki koe?', sm: 'Ua e pua\'i?', nl: 'Heeft u overgegeven?' },
  symptom_fever:     { en: 'Do you have a fever?',                  mi: 'He kōhukihuki ōu?', sm: 'E te fiva?', nl: 'Heeft u koorts?' },

  // ── Provider status ──────────────────────────────────────────────────────
  provider_shortly:  { en: 'Your provider will be with you shortly', mi: 'Ka tae atu tō rata āpōpō tata', sm: 'O le a o\'o atu lou foma\'i i se taimi puupuu', nl: 'Uw zorgverlener is zo bij u' },

  // ── Buttons ──────────────────────────────────────────────────────────────
  btn_continue: { en: 'Continue', mi: 'Haere tonu', sm: 'Fa\'aauau', nl: 'Doorgaan' },
  btn_back:     { en: 'Back',     mi: 'Hoki',       sm: 'Toe fo\'i', nl: 'Terug' },
  // Opt-in subtitle button on the video call. Kept short so it fits as a
  // pill overlay without wrapping. Patient-facing wording — describes the
  // action from the patient's perspective ("show subtitles for me").
  subtitle_offer_btn: {
    en: 'Show subtitles',
    mi: 'Whakaatu i ngā hauraro', // TODO cert
    sm: 'Fa\'aali fa\'aliliuga', // TODO cert
    zh: '显示字幕', ja: '字幕を表示', ko: '자막 표시',
    de: 'Untertitel anzeigen', nl: 'Ondertitels tonen',
    fr: 'Afficher les sous-titres', es: 'Mostrar subtítulos',
    ar: 'إظهار الترجمة', hi: 'सबटाइटल दिखाएँ',
  },
  subtitle_offer_hint: {
    en: "Can't understand?",
    mi: 'Kāore koe e mārama?', // TODO cert
    sm: 'E te le malamalama?', // TODO cert
    zh: '听不懂？', ja: 'わからない？', ko: '이해가 안 되세요?',
    de: 'Nicht verstehen?', nl: 'Niet verstaan?',
    fr: 'Vous ne comprenez pas ?', es: '¿No entiende?',
    ar: 'لا تفهم؟', hi: 'समझ नहीं आ रहा?',
  },
  subtitle_hide_btn: {
    en: 'Hide',
    mi: 'Huna', sm: 'Nātia',
    zh: '隐藏', ja: '非表示', ko: '숨기기',
    de: 'Ausblenden', nl: 'Verbergen',
    fr: 'Masquer', es: 'Ocultar',
    ar: 'إخفاء', hi: 'छिपाएँ',
  },

  btn_skip:     {
    en: 'Skip', mi: 'Tukua', sm: 'Preterisi', // TODO cert (mi/sm)
    zh: '跳过', ja: 'スキップ', ko: '건너뛰기',
    de: 'Überspringen', nl: 'Overslaan', fr: 'Passer', es: 'Omitir',
    ar: 'تخطي', hi: 'छोड़ें',
  },
  btn_send:     {
    en: 'Send', mi: 'Tuku', sm: 'Auina atu', // TODO cert (mi/sm)
    zh: '发送', ja: '送信', ko: '보내기',
    de: 'Senden', nl: 'Versturen', fr: 'Envoyer', es: 'Enviar',
    ar: 'إرسال', hi: 'भेजें',
  },
  btn_submit:   { en: 'Submit',   mi: 'Tukua atu',  sm: 'Tu\'u atu', nl: 'Indienen' },

  // ── Bilingual red flag: shows Te Reo + English regardless of chosen language ─
  // Rendered by t_bilingual() helper so critical warnings never appear in Te Reo only.
  red_flag_call_111: { en: 'Call 111 immediately', mi: 'Waea atu ki te 111 ināianei', sm: 'Vala\'au le 111 i le taimi lava lenei', nl: 'Bel onmiddellijk 111' },

  // ── /consent page (ConsentPage.jsx) ──────────────────────────────────────
  // Every string on the /consent screen. mi + sm marked TODO cert.
  consent_header:      { en: 'Before we begin', mi: 'I mua i tā tāua tīmatanga', sm: 'A\'o le\'i amata', zh: '开始之前', ja: '始める前に', ko: '시작하기 전에', de: 'Bevor wir beginnen', nl: 'Voordat we beginnen', fr: 'Avant de commencer', es: 'Antes de comenzar', ar: 'قبل أن نبدأ', hi: 'शुरू करने से पहले' }, // TODO cert (mi/sm)
  consent_subheader:   { en: 'Please read and agree to the following', mi: 'Tēnā, pānuihia me whakaae ki ēnei', sm: 'Fa\'amolemole faitau ma malie i mea nei', zh: '请阅读并同意以下内容', ja: '以下をお読みになり、同意してください', ko: '아래를 읽고 동의해 주세요', de: 'Bitte lesen und stimmen Sie Folgendem zu', nl: 'Lees en ga akkoord met het volgende', fr: 'Veuillez lire et accepter ce qui suit', es: 'Por favor lea y acepte lo siguiente', ar: 'يرجى قراءة ما يلي والموافقة عليه', hi: 'कृपया निम्नलिखित पढ़ें और सहमत हों' }, // TODO cert (mi/sm)

  consent_rights_title: { en: 'Your rights as a patient', mi: 'Ōu mōtika hei tūroro', sm: 'O ou aia tatau o se ma\'i', zh: '您作为患者的权利', ja: '患者としてのあなたの権利', ko: '환자로서 당신의 권리', de: 'Ihre Rechte als Patient', nl: 'Uw rechten als patiënt', fr: 'Vos droits en tant que patient', es: 'Sus derechos como paciente', ar: 'حقوقك كمريض', hi: 'रोगी के रूप में आपके अधिकार' }, // TODO cert (mi/sm)
  consent_rights_intro: {
    en: 'As a patient using Tere Health you have the following rights under the NZ Health and Disability Commissioner Code of Rights:',
    mi: 'Hei tūroro e whakamahi ana i a Tere Health, ka whai koe i ēnei mōtika i raro i te Waehere Mōtika a te Kaikōmihana Hauora, Hauātanga o Aotearoa:', // TODO cert
    sm: 'I le avea ai o se ma\'i o lo\'o fa\'aogaina Tere Health, e i ai ou aia tatau nei i lalo o le Tulafono a le Komesina o le Soifua Maloloina ma le Fa\'aletonu o Niu Sila:', // TODO cert
    zh: '作为使用 Tere Health 的患者，您根据新西兰健康和残疾专员权利守则享有以下权利：',
    ja: 'Tere Healthを利用する患者として、ニュージーランドの健康・障害委員会権利規範に基づき、以下の権利があります：',
    ko: 'Tere Health를 이용하는 환자로서, 뉴질랜드 건강 및 장애 커미셔너 권리 강령에 따라 다음과 같은 권리가 있습니다:',
    de: 'Als Patient, der Tere Health nutzt, haben Sie folgende Rechte gemäß dem NZ Health and Disability Commissioner Code of Rights:',
    nl: 'Als patiënt die Tere Health gebruikt heeft u de volgende rechten op grond van de NZ Health and Disability Commissioner Code of Rights:',
    fr: 'En tant que patient utilisant Tere Health, vous avez les droits suivants en vertu du Code des droits du Commissaire à la santé et au handicap de NZ :',
    es: 'Como paciente que usa Tere Health, tiene los siguientes derechos bajo el Código de Derechos del Comisionado de Salud y Discapacidad de NZ:',
    ar: 'بصفتك مريضاً يستخدم Tere Health، لديك الحقوق التالية بموجب مدونة حقوق مفوض الصحة والإعاقة النيوزيلندية:',
    hi: 'Tere Health का उपयोग करने वाले रोगी के रूप में, आपके पास NZ स्वास्थ्य और विकलांगता आयुक्त अधिकार संहिता के तहत निम्नलिखित अधिकार हैं:',
  },
  consent_right_respect:     { en: 'Right to be treated with respect', mi: 'Te mōtika kia manaakitia', sm: 'Aia tatau ia faia ma le fa\'aaloalo', zh: '受尊重的权利', ja: '敬意をもって扱われる権利', ko: '존중받을 권리', de: 'Recht auf respektvolle Behandlung', nl: 'Recht op respectvolle behandeling', fr: 'Droit d\'être traité avec respect', es: 'Derecho a ser tratado con respeto', ar: 'الحق في المعاملة باحترام', hi: 'सम्मान के साथ व्यवहार पाने का अधिकार' }, // TODO cert (mi/sm)
  consent_right_info:        { en: 'Right to receive information', mi: 'Te mōtika kia whakamōhio', sm: 'Aia tatau ia maua fa\'amatalaga', zh: '获得信息的权利', ja: '情報を受け取る権利', ko: '정보를 받을 권리', de: 'Recht auf Information', nl: 'Recht op informatie', fr: 'Droit à l\'information', es: 'Derecho a recibir información', ar: 'الحق في الحصول على المعلومات', hi: 'जानकारी प्राप्त करने का अधिकार' }, // TODO cert (mi/sm)
  consent_right_informed:    { en: 'Right to make an informed choice', mi: 'Te mōtika ki te whiriwhiri whai mōhiotanga', sm: 'Aia tatau ia faia se filifiliga malamalama', zh: '做出知情选择的权利', ja: 'インフォームド・チョイスの権利', ko: '충분한 정보에 근거한 선택의 권리', de: 'Recht auf informierte Entscheidung', nl: 'Recht op een geïnformeerde keuze', fr: 'Droit à un choix éclairé', es: 'Derecho a tomar una decisión informada', ar: 'الحق في اتخاذ خيار مستنير', hi: 'सूचित विकल्प चुनने का अधिकार' }, // TODO cert (mi/sm)
  consent_right_consent:     { en: 'Right to give informed consent', mi: 'Te mōtika ki te whakaae whai mōhiotanga', sm: 'Aia tatau ia tuu le malie malamalama', zh: '给予知情同意的权利', ja: 'インフォームド・コンセントの権利', ko: '충분한 정보에 근거한 동의의 권리', de: 'Recht auf informierte Einwilligung', nl: 'Recht om geïnformeerde toestemming te geven', fr: 'Droit de donner un consentement éclairé', es: 'Derecho a dar consentimiento informado', ar: 'الحق في تقديم موافقة مستنيرة', hi: 'सूचित सहमति देने का अधिकार' }, // TODO cert (mi/sm)
  consent_right_complain:    { en: 'Right to complain', mi: 'Te mōtika ki te amuamu', sm: 'Aia tatau ia fai se faitioga', zh: '投诉的权利', ja: '苦情を申し立てる権利', ko: '불만을 제기할 권리', de: 'Recht auf Beschwerde', nl: 'Recht om een klacht in te dienen', fr: 'Droit de porter plainte', es: 'Derecho a quejarse', ar: 'الحق في الشكوى', hi: 'शिकायत करने का अधिकार' }, // TODO cert (mi/sm)
  consent_rights_link:       { en: 'Read the full HDC Code of Rights →', mi: 'Pānuihia te Waehere Mōtika HDC katoa →', sm: 'Faitau le Tulafono atoa a le HDC →', zh: '阅读完整的 HDC 权利守则 →', ja: 'HDC権利規範の全文を読む →', ko: '전체 HDC 권리 강령 읽기 →', de: 'Vollständigen HDC-Rechtekodex lesen →', nl: 'Lees de volledige HDC Code of Rights →', fr: 'Lire le Code des droits HDC complet →', es: 'Leer el Código de Derechos completo del HDC →', ar: 'اقرأ مدونة حقوق HDC كاملة →', hi: 'पूरा HDC अधिकार संहिता पढ़ें →' }, // TODO cert (mi/sm)
  consent_ai_note: {
    en: 'Your clinical information (including consultation transcript, chief complaint and notes) is processed by Anthropic Claude, delivered via AWS Bedrock under an executed Business Associate Agreement (BAA) with AWS that provides HIPAA-level safeguards. AI-generated notes are reviewed and finalised by a New Zealand-registered clinician. Your information is never used to train AI models.',
    mi: 'Ka tukatukahia ō kōrero hauora (tae atu ki te tuhinga tirohanga, te take matua me ngā tuhinga) e Anthropic Claude, ka tukua mā AWS Bedrock i raro i tētahi Kirimana Whakahoahoa Pakihi (BAA) me AWS e whakarato ana i ngā ārai HIPAA. Ka arotakengia, ka whakaotia ngā tuhinga i hangaia e te AI e tētahi mātanga hauora kua rēhita ki Aotearoa. E kore ō kōrero e whakamahia ki te whakangungu tauira AI.', // TODO cert
    sm: 'O ou fa\'amatalaga fa\'afoma\'i (e aofia ai le tusiga o le asiasiga, mafua\'aga o le sau ma tusi manatu) e fa\'agaioia e Anthropic Claude, fa\'atino atu e ala i le AWS Bedrock i lalo o se Maliliega Fa\'apisinisi Fa\'aletagata (BAA) ma le AWS lea e tuu atu ai puipuiga tulaga HIPAA. O tusi manatu na faia e le AI e iloilo ma fa\'amaonia e se foma\'i o Niu Sila. O ou fa\'amatalaga e le\'i fa\'aogaina lava mo le a\'oa\'oina o fa\'ata\'ita\'iga AI.', // TODO cert
    zh: '您的临床信息（包括会诊转录、主诉和笔记）由 Anthropic Claude 处理，通过 AWS Bedrock 提供服务，AWS 已签署业务伙伴协议（BAA），提供 HIPAA 级别的保护。AI 生成的笔记由新西兰注册的临床医生审查并最终确认。您的信息绝不会用于训练 AI 模型。',
    ja: 'あなたの臨床情報（診察記録、主訴、メモを含む）は、AWSと締結したビジネスアソシエート契約（BAA）に基づきHIPAAレベルの保護措置が提供されるAWS Bedrock経由で、Anthropic Claudeによって処理されます。AI生成のメモは、ニュージーランド登録の臨床医によりレビューおよび最終化されます。あなたの情報はAIモデルの訓練に使用されることはありません。',
    ko: '귀하의 임상 정보(상담 기록, 주요 증상 및 노트 포함)는 Anthropic Claude에 의해 처리되며, AWS와 체결된 비즈니스 어소시에이트 계약(BAA)에 따라 HIPAA 수준의 보호가 제공되는 AWS Bedrock을 통해 전달됩니다. AI 생성 노트는 뉴질랜드 등록 임상의에 의해 검토 및 최종화됩니다. 귀하의 정보는 AI 모델 학습에 절대 사용되지 않습니다.',
    de: 'Ihre klinischen Informationen (einschließlich Konsultationstranskript, Hauptbeschwerde und Notizen) werden von Anthropic Claude verarbeitet, bereitgestellt über AWS Bedrock unter einer geschlossenen Business Associate Agreement (BAA) mit AWS, die HIPAA-Niveau-Schutzmaßnahmen bietet. Von KI generierte Notizen werden von einem in Neuseeland registrierten Kliniker überprüft und finalisiert. Ihre Informationen werden nie zur Schulung von KI-Modellen verwendet.',
    nl: 'Uw klinische gegevens (waaronder consultverslag, hoofdklacht en aantekeningen) worden verwerkt door Anthropic Claude, geleverd via AWS Bedrock onder een afgesloten Business Associate Agreement (BAA) met AWS die waarborgen biedt op HIPAA-niveau. Door AI gegenereerde aantekeningen worden beoordeeld en definitief gemaakt door een in Nieuw-Zeeland geregistreerde clinicus. Uw gegevens worden nooit gebruikt om AI-modellen te trainen.',
    fr: 'Vos informations cliniques (y compris la transcription de consultation, la plainte principale et les notes) sont traitées par Anthropic Claude, fournies via AWS Bedrock dans le cadre d\'un Accord de Partenaire Commercial (BAA) exécuté avec AWS qui fournit des protections de niveau HIPAA. Les notes générées par IA sont examinées et finalisées par un clinicien enregistré en Nouvelle-Zélande. Vos informations ne sont jamais utilisées pour entraîner des modèles d\'IA.',
    es: 'Su información clínica (incluida la transcripción de la consulta, la queja principal y las notas) es procesada por Anthropic Claude, entregada a través de AWS Bedrock bajo un Acuerdo de Asociado Comercial (BAA) ejecutado con AWS que proporciona protecciones a nivel HIPAA. Las notas generadas por IA son revisadas y finalizadas por un clínico registrado en Nueva Zelanda. Su información nunca se utiliza para entrenar modelos de IA.',
    ar: 'تتم معالجة معلوماتك السريرية (بما في ذلك نص الاستشارة والشكوى الرئيسية والملاحظات) بواسطة Anthropic Claude، ويتم تسليمها عبر AWS Bedrock بموجب اتفاقية شريك أعمال (BAA) مبرمة مع AWS توفر ضمانات على مستوى HIPAA. تتم مراجعة الملاحظات التي أنشأها الذكاء الاصطناعي وإكمالها من قبل طبيب مسجل في نيوزيلندا. لا يتم استخدام معلوماتك أبداً لتدريب نماذج الذكاء الاصطناعي.',
    hi: 'आपकी नैदानिक जानकारी (परामर्श प्रतिलेख, मुख्य शिकायत और नोट्स सहित) Anthropic Claude द्वारा संसाधित की जाती है, जो AWS के साथ निष्पादित बिजनेस एसोसिएट एग्रीमेंट (BAA) के तहत AWS Bedrock के माध्यम से वितरित की जाती है जो HIPAA-स्तर की सुरक्षा प्रदान करता है। AI द्वारा उत्पन्न नोट्स की समीक्षा और अंतिम रूप न्यूजीलैंड-पंजीकृत चिकित्सक द्वारा किया जाता है। आपकी जानकारी का उपयोग AI मॉडल को प्रशिक्षित करने के लिए कभी नहीं किया जाता है।',
  },
  consent_rights_check: { en: 'I understand my rights as a patient and consent to AI-assisted processing', mi: 'Kei te mārama ahau ki ōku mōtika hei tūroro, ā, kei te whakaae ki te tukatuka āwhinatia e te AI', sm: 'Ou te malamalama i o\'u aia tatau o se ma\'i ma malie i le fa\'agasologa fesoasoani a le AI', zh: '我了解我作为患者的权利，并同意 AI 辅助处理', ja: '患者としての権利を理解し、AI支援処理に同意します', ko: '환자로서의 권리를 이해하며 AI 지원 처리에 동의합니다', de: 'Ich verstehe meine Rechte als Patient und stimme der KI-gestützten Verarbeitung zu', nl: 'Ik begrijp mijn rechten als patiënt en geef toestemming voor door AI ondersteunde verwerking', fr: 'Je comprends mes droits en tant que patient et consens au traitement assisté par IA', es: 'Entiendo mis derechos como paciente y consiento el procesamiento asistido por IA', ar: 'أفهم حقوقي كمريض وأوافق على المعالجة بمساعدة الذكاء الاصطناعي', hi: 'मैं रोगी के रूप में अपने अधिकारों को समझता/समझती हूं और AI-सहायता प्राप्त प्रसंस्करण के लिए सहमति देता/देती हूं' }, // TODO cert (mi/sm)

  consent_rx_title: { en: 'Prescribing limitations', mi: 'Ngā herenga tuku rongoā', sm: 'Fa\'atapula\'aga o le tuu atu o fualaau', zh: '处方限制', ja: '処方の制限', ko: '처방 제한 사항', de: 'Verschreibungsbeschränkungen', nl: 'Beperkingen bij het voorschrijven', fr: 'Limitations de prescription', es: 'Limitaciones de prescripción', ar: 'قيود الوصفات الطبية', hi: 'दवा लिखने की सीमाएं' }, // TODO cert (mi/sm)
  consent_rx_intro: {
    en: 'Tere Health providers can prescribe many medications for acute conditions. However we are unable to prescribe via telehealth:',
    mi: 'Ka taea e ngā kaiwhakarato o Tere Health te tuku i te maha o ngā rongoā mō ngā mate ohorere. Heoi anō, kāore mātou e taea te tuku i ngā rongoā e whai ake nei mā te telehealth:', // TODO cert
    sm: 'E mafai e le au foma\'i o Tere Health ona tuu atu le tele o fualaau mo tulaga fa\'afuase\'i. Peita\'i, e le mafai ona matou tuu atu e ala i le telehealth:', // TODO cert
    zh: 'Tere Health 的医生可以为急性病症开具许多药物。但我们无法通过远程医疗开具以下药物：',
    ja: 'Tere Healthの医師は急性症状に対する多くの薬を処方できます。ただし、テレヘルスでは以下の薬は処方できません：',
    ko: 'Tere Health 의사들은 급성 질환에 대한 많은 약을 처방할 수 있습니다. 그러나 원격 진료를 통해서는 다음을 처방할 수 없습니다:',
    de: 'Tere-Health-Ärzte können viele Medikamente für akute Erkrankungen verschreiben. Wir können jedoch nicht per Telemedizin verschreiben:',
    nl: 'Artsen van Tere Health kunnen veel medicijnen voorschrijven voor acute aandoeningen. Wij kunnen echter niet via telezorg voorschrijven:',
    fr: 'Les médecins de Tere Health peuvent prescrire de nombreux médicaments pour des conditions aiguës. Cependant, nous ne pouvons pas prescrire via la télémédecine :',
    es: 'Los médicos de Tere Health pueden recetar muchos medicamentos para condiciones agudas. Sin embargo, no podemos recetar mediante telemedicina:',
    ar: 'يمكن لأطباء Tere Health وصف كثير من الأدوية للحالات الحادة. ومع ذلك، لا يمكننا الوصف عبر الرعاية الصحية عن بُعد:',
    hi: 'Tere Health के डॉक्टर तीव्र स्थितियों के लिए कई दवाएं लिख सकते हैं। हालांकि, हम टेलीहेल्थ के माध्यम से निम्नलिखित नहीं लिख सकते:',
  },
  consent_rx_footer: {
    en: 'For these medications please contact your regular GP or visit an in-person clinic.',
    mi: 'Mō ēnei rongoā tēnā koa whakapā atu ki tō GP, haere rānei ki tētahi hōkinga tirohanga kanohi.', // TODO cert
    sm: 'Mo nei fualaau fa\'amolemole feso\'ota\'i ma lou GP masani po\'o asiasi i se falema\'i tino.', // TODO cert
    zh: '如需这些药物，请联系您的常规全科医生或前往面对面诊所就诊。',
    ja: 'これらの薬については、通常のかかりつけ医に連絡するか、対面クリニックを受診してください。',
    ko: '이러한 약이 필요하시면 정기적인 GP에게 연락하거나 대면 클리닉을 방문해 주세요.',
    de: 'Für diese Medikamente wenden Sie sich bitte an Ihren regulären Hausarzt oder besuchen Sie eine Klinik persönlich.',
    nl: 'Voor deze medicijnen kunt u contact opnemen met uw vaste huisarts of een fysieke praktijk bezoeken.',
    fr: 'Pour ces médicaments, veuillez contacter votre médecin traitant ou consulter une clinique en personne.',
    es: 'Para estos medicamentos, por favor contacte a su médico de cabecera habitual o visite una clínica en persona.',
    ar: 'لهذه الأدوية يرجى الاتصال بطبيبك العام العادي أو زيارة عيادة شخصياً.',
    hi: 'इन दवाओं के लिए कृपया अपने नियमित GP से संपर्क करें या व्यक्तिगत रूप से क्लिनिक जाएं।',
  },
  consent_rx_check: { en: 'I understand these prescribing limitations', mi: 'Kei te mārama ahau ki ēnei herenga tuku rongoā', sm: 'Ou te malamalama i nei fa\'atapula\'aga', zh: '我理解这些处方限制', ja: 'これらの処方制限を理解しました', ko: '이 처방 제한 사항을 이해합니다', de: 'Ich verstehe diese Verschreibungsbeschränkungen', nl: 'Ik begrijp deze beperkingen bij het voorschrijven', fr: 'Je comprends ces limitations de prescription', es: 'Entiendo estas limitaciones de prescripción', ar: 'أفهم هذه القيود على الوصفات الطبية', hi: 'मैं इन दवा लिखने की सीमाओं को समझता/समझती हूं' }, // TODO cert (mi/sm)

  consent_research_title:    { en: 'Help improve rural healthcare', mi: 'Āwhinaia te whakapai ake i te hauora tuawhenua', sm: 'Fesoasoani e fa\'aleleia le tausiga o le soifua maloloina i nu\'u maotua', zh: '帮助改善农村医疗保健', ja: '地方医療の改善に貢献', ko: '농촌 의료 개선을 돕기', de: 'Ländliche Gesundheitsversorgung verbessern helfen', nl: 'Help de zorg op het platteland te verbeteren', fr: 'Aider à améliorer les soins de santé ruraux', es: 'Ayudar a mejorar la atención sanitaria rural', ar: 'ساعد في تحسين الرعاية الصحية الريفية', hi: 'ग्रामीण स्वास्थ्य देखभाल में सुधार करने में मदद करें' }, // TODO cert (mi/sm)
  consent_research_optional: { en: '(optional)', mi: '(kōwhiringa)', sm: '(filifili)', zh: '（可选）', ja: '（任意）', ko: '(선택 사항)', de: '(optional)', nl: '(optioneel)', fr: '(facultatif)', es: '(opcional)', ar: '(اختياري)', hi: '(वैकल्पिक)' }, // TODO cert (mi/sm)
  consent_research_intro: {
    en: 'Would you be willing for your de-identified data (no name, no contact details, no NHI) to contribute to NZ rural health research? This helps improve healthcare for rural communities across Aotearoa.',
    mi: 'E hiahia ana koe ki te whakaae kia whakauruhia ō raraunga kāore i te whakatinana (kāore he ingoa, kāore he whakapā, kāore he NHI) hei tautoko i te rangahau hauora tuawhenua o Aotearoa? Ka āwhina tēnei ki te whakapai ake i te hauora mō ngā hapori tuawhenua puta noa i Aotearoa.', // TODO cert
    sm: 'E te malie e faia ni sao mai au fa\'amatalaga e le\'i fa\'ailoaina (leai se igoa, leai ni fa\'amatalaga fa\'afeso\'ota\'i, leai se NHI) i su\'esu\'ega o le soifua maloloina i nu\'u maotua o Niu Sila? E fesoasoani lenei mea e fa\'aleleia le tausiga o le soifua maloloina mo nu\'u maotua i Aotearoa.', // TODO cert
    zh: '您是否愿意让您的去标识化数据（无姓名、无联系方式、无 NHI）为新西兰农村健康研究做出贡献？这有助于改善新西兰农村社区的医疗保健。',
    ja: '匿名化されたデータ（名前、連絡先、NHIなし）をニュージーランドの地方医療研究に貢献させることに同意されますか？これは、アオテアロア（NZ）全土の地方コミュニティの医療改善に役立ちます。',
    ko: '귀하의 비식별화된 데이터(이름, 연락처, NHI 없음)를 뉴질랜드 농촌 건강 연구에 기여하도록 하시겠습니까? 이는 아오테아로아 전역의 농촌 지역사회 의료 개선에 도움이 됩니다.',
    de: 'Wären Sie bereit, dass Ihre anonymisierten Daten (kein Name, keine Kontaktdaten, keine NHI) zur ländlichen Gesundheitsforschung in Neuseeland beitragen? Dies hilft, die Gesundheitsversorgung für ländliche Gemeinden in ganz Aotearoa zu verbessern.',
    nl: 'Zou u bereid zijn uw geanonimiseerde gegevens (geen naam, geen contactgegevens, geen NHI) beschikbaar te stellen voor onderzoek naar plattelandsgezondheidszorg in Nieuw-Zeeland? Dit helpt de zorg voor plattelandsgemeenschappen in heel Aotearoa te verbeteren.',
    fr: 'Seriez-vous prêt à ce que vos données anonymisées (sans nom, sans coordonnées, sans NHI) contribuent à la recherche sur la santé rurale en NZ ? Cela contribue à améliorer les soins de santé pour les communautés rurales dans toute l\'Aotearoa.',
    es: '¿Estaría dispuesto a que sus datos desidentificados (sin nombre, sin datos de contacto, sin NHI) contribuyan a la investigación de salud rural de NZ? Esto ayuda a mejorar la atención sanitaria para las comunidades rurales en todo Aotearoa.',
    ar: 'هل ستكون على استعداد لأن تساهم بياناتك مجهولة الهوية (بدون اسم أو بيانات اتصال أو NHI) في أبحاث الصحة الريفية النيوزيلندية؟ يساعد ذلك في تحسين الرعاية الصحية لمجتمعات المناطق الريفية في جميع أنحاء أوتياروا.',
    hi: 'क्या आप अपने डी-आइडेंटिफाइड डेटा (कोई नाम नहीं, कोई संपर्क विवरण नहीं, कोई NHI नहीं) को NZ ग्रामीण स्वास्थ्य अनुसंधान में योगदान करने के लिए तैयार होंगे? यह पूरे Aotearoa में ग्रामीण समुदायों के लिए स्वास्थ्य देखभाल में सुधार करने में मदद करता है।',
  },
  consent_research_yes:  { en: '✓ Yes, I\'m happy to contribute', mi: '✓ Āe, kei te pai ki ahau ki te tautoko', sm: '✓ Ioe, ou te fiafia e sao mai', zh: '✓ 是的，我愿意贡献', ja: '✓ はい、貢献します', ko: '✓ 네, 기여하겠습니다', de: '✓ Ja, ich möchte beitragen', nl: '✓ Ja, ik draag graag bij', fr: '✓ Oui, je souhaite contribuer', es: '✓ Sí, me gustaría contribuir', ar: '✓ نعم، أنا سعيد بالمساهمة', hi: '✓ हाँ, मैं योगदान करने के लिए तैयार हूं' }, // TODO cert (mi/sm)
  consent_research_skip: { en: 'Skip →', mi: 'Tukua →', sm: 'Preterisi →', zh: '跳过 →', ja: 'スキップ →', ko: '건너뛰기 →', de: 'Überspringen →', nl: 'Overslaan →', fr: 'Passer →', es: 'Omitir →', ar: 'تخطي ←', hi: 'छोड़ें →' }, // TODO cert (mi/sm)
  consent_research_footnote: {
    en: 'Your decision won\'t affect your care. You can withdraw consent at any time by contacting',
    mi: 'Kāore tō whiringa e pā ki tō tiaki hauora. Ka taea e koe te unu i tō whakaae i te wā e hiahia ana koe mā te whakapā atu ki', // TODO cert
    sm: 'O lau fa\'ai\'uga e le a\'afia ai lou tausiga. E mafai ona e toe aveese lau malie i so\'o se taimi e ala i le feso\'ota\'i atu i', // TODO cert
    zh: '您的决定不会影响您的医疗服务。您可以随时通过联系以下方式撤回同意：',
    ja: 'あなたの決定はケアに影響しません。次にご連絡いただくことで、いつでも同意を撤回できます：',
    ko: '귀하의 결정은 진료에 영향을 미치지 않습니다. 다음 연락처로 언제든지 동의를 철회할 수 있습니다:',
    de: 'Ihre Entscheidung beeinflusst nicht Ihre Versorgung. Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie kontaktieren',
    nl: 'Uw beslissing heeft geen invloed op uw zorg. U kunt uw toestemming op elk moment intrekken door contact op te nemen met',
    fr: 'Votre décision n\'affectera pas vos soins. Vous pouvez retirer votre consentement à tout moment en contactant',
    es: 'Su decisión no afectará su atención. Puede retirar el consentimiento en cualquier momento contactando a',
    ar: 'قرارك لن يؤثر على رعايتك. يمكنك سحب الموافقة في أي وقت بالتواصل مع',
    hi: 'आपका निर्णय आपकी देखभाल को प्रभावित नहीं करेगा। आप किसी भी समय संपर्क करके सहमति वापस ले सकते हैं',
  },

  consent_camera_title: { en: 'Camera used for vitals', mi: 'Ka whakamahia te kāmera mō ngā tohu ora', sm: 'E fa\'aogaina le meapu\'e ata mo tulaga o le tino', zh: '使用相机进行生命体征测量', ja: 'バイタル測定のためにカメラを使用します', ko: '활력징후 측정에 카메라 사용', de: 'Kamera für Vitalzeichen verwendet', nl: 'Camera gebruikt voor vitale functies', fr: 'Caméra utilisée pour les signes vitaux', es: 'Cámara utilizada para signos vitales', ar: 'الكاميرا مستخدمة للعلامات الحيوية', hi: 'वाइटल्स के लिए कैमरे का उपयोग' }, // TODO cert (mi/sm)
  consent_camera_desc: {
    en: 'For accurate vitals, Tere may use your camera during the consultation. No video is recorded — only anonymised colour measurements are used to estimate heart rate and blood oxygen.',
    mi: 'Mō ngā tohu ora tika, ka whakamahia pea e Tere tō kāmera i te wā o te tirohanga. Kāore he ataata e hopukina ana — ka whakamahia noa ngā ine tae kua whakaingoakorehia hei whakatau i te tere manawa me te hāora toto.', // TODO cert
    sm: 'Mo tulaga sa\'o o le tino, atonu e fa\'aaoga e Tere lau meapu\'e ata i le taimi o le asiasiga. E leai se ata na pu\'eina — na\'o fua o lanu e le\'i fa\'ailoaina e fa\'aogaina e fa\'atatau ai le saoasaoa o le fatu ma le okesene o le toto.', // TODO cert
    zh: '为了准确测量生命体征，Tere 可能会在会诊期间使用您的相机。不会录制视频——仅使用匿名颜色测量来估计心率和血氧。',
    ja: '正確なバイタル測定のため、Tereは診察中にカメラを使用することがあります。動画は記録されず、匿名化された色測定のみを使用して心拍数と血中酸素を推定します。',
    ko: '정확한 활력징후를 위해, Tere는 상담 중 카메라를 사용할 수 있습니다. 비디오는 녹화되지 않으며 — 익명화된 색상 측정값만 사용하여 심박수와 혈중 산소를 추정합니다.',
    de: 'Für genaue Vitalwerte kann Tere während der Konsultation Ihre Kamera verwenden. Es wird kein Video aufgezeichnet — nur anonymisierte Farbmessungen werden verwendet, um Herzfrequenz und Blutsauerstoff zu schätzen.',
    nl: 'Voor nauwkeurige vitale functies kan Tere tijdens het consult uw camera gebruiken. Er wordt geen video opgenomen — er worden alleen geanonimiseerde kleurmetingen gebruikt om uw hartslag en het zuurstofgehalte in uw bloed te schatten.',
    fr: 'Pour des signes vitaux précis, Tere peut utiliser votre caméra pendant la consultation. Aucune vidéo n\'est enregistrée — seules des mesures de couleur anonymisées sont utilisées pour estimer le rythme cardiaque et l\'oxygène du sang.',
    es: 'Para obtener signos vitales precisos, Tere puede usar su cámara durante la consulta. No se graba ningún video — solo se utilizan mediciones de color anonimizadas para estimar la frecuencia cardíaca y el oxígeno en la sangre.',
    ar: 'للحصول على علامات حيوية دقيقة، قد يستخدم Tere الكاميرا الخاصة بك أثناء الاستشارة. لا يتم تسجيل أي فيديو — يتم استخدام قياسات الألوان مجهولة الهوية فقط لتقدير معدل ضربات القلب والأكسجين في الدم.',
    hi: 'सटीक वाइटल्स के लिए, Tere परामर्श के दौरान आपके कैमरे का उपयोग कर सकता है। कोई वीडियो रिकॉर्ड नहीं किया जाता — केवल गुमनाम रंग मापों का उपयोग हृदय गति और रक्त ऑक्सीजन का अनुमान लगाने के लिए किया जाता है।',
  },

  consent_emergency_111:  { en: 'Emergency? Call 111',                    mi: 'He whawhati tata? Waea atu ki te 111',                  sm: 'Fa\'afuase\'i? Vala\'au le 111',                     zh: '紧急情况？请拨打 111',              ja: '緊急ですか？111に電話してください',       ko: '응급 상황? 111에 전화하세요',            de: 'Notfall? 111 anrufen',                       nl: 'Noodgeval? Bel 111',                          fr: 'Urgence ? Appelez le 111',                    es: '¿Emergencia? Llame al 111',                        ar: 'حالة طارئة؟ اتصل بـ 111',                    hi: 'आपातकाल? 111 पर कॉल करें' }, // TODO cert (mi/sm)
  consent_emergency_1737: { en: 'Mental health crisis? Call or text 1737', mi: 'He raru hinengaro? Waea, tuku pānui rānei ki te 1737', sm: 'Fa\'afitauli o le mafaufau? Vala\'au po\'o tusi 1737', zh: '心理健康危机？请拨打或发短信 1737', ja: 'メンタルヘルス危機？1737に電話またはテキストしてください', ko: '정신 건강 위기? 1737에 전화 또는 문자하세요', de: 'Mental-Health-Krise? Rufen Sie 1737 an oder senden Sie eine SMS', nl: 'Psychische crisis? Bel of sms 1737', fr: 'Crise de santé mentale ? Appelez ou envoyez un SMS au 1737', es: '¿Crisis de salud mental? Llame o envíe un mensaje al 1737', ar: 'أزمة صحية نفسية؟ اتصل أو راسل نصياً 1737', hi: 'मानसिक स्वास्थ्य संकट? 1737 पर कॉल करें या टेक्स्ट करें' }, // TODO cert (mi/sm)

  consent_continue:     { en: 'Continue →', mi: 'Haere tonu →', sm: 'Fa\'aauau →', zh: '继续 →', ja: '続ける →', ko: '계속 →', de: 'Weiter →', nl: 'Doorgaan →', fr: 'Continuer →', es: 'Continuar →', ar: 'متابعة ←', hi: 'जारी रखें →' }, // TODO cert (mi/sm)
  consent_subtitle_title: { en: 'Live subtitles (optional)', mi: 'Ngā hauraro ora (kōwhiringa)', sm: 'Fa\'aliliuga ola (filifili)', zh: '实时字幕（可选）', ja: 'ライブ字幕（任意）', ko: '실시간 자막 (선택 사항)', de: 'Live-Untertitel (optional)', nl: 'Live-ondertiteling (optioneel)', fr: 'Sous-titres en direct (optionnel)', es: 'Subtítulos en vivo (opcional)', ar: 'الترجمة الحية (اختياري)', hi: 'लाइव सबटाइटल (वैकल्पिक)' }, // TODO cert (mi/sm)
  consent_subtitle_desc: {
    en: 'If you selected a language other than English, we can show AI-translated subtitles during your video consultation. Please understand:',
    mi: 'Ki te kōwhiria e koe he reo tērā atu i te reo Ingarihi, ka taea e mātou te whakaatu i ngā hauraro whakamāoritia e te AI i tō tirohanga ataata. Kia mōhio mai koe:', // TODO cert
    sm: 'Afai e te filifilia se gagana e ese mai le Igilisi, e mafai ona matou fa\'aali fa\'aliliuga fa\'alelemafaufau ola i lau asiasiga vitio. Fa\'amolemole malamalama:', // TODO cert
    zh: '如果您选择了非英语语言，我们可以在您的视频会诊期间显示 AI 翻译的字幕。请注意：',
    ja: '英語以外の言語を選択された場合、ビデオ診察中に AI 翻訳の字幕を表示できます。以下をご理解ください：',
    ko: '영어 이외의 언어를 선택하신 경우, 화상 상담 중 AI 번역 자막을 표시할 수 있습니다. 다음을 이해해 주세요:',
    de: 'Wenn Sie eine andere Sprache als Englisch gewählt haben, können wir während Ihrer Videokonsultation KI-übersetzte Untertitel anzeigen. Bitte beachten Sie:',
    nl: 'Als u een andere taal dan Engels heeft gekozen, kunnen wij tijdens uw videoconsult door AI vertaalde ondertitels tonen. Let alstublieft op het volgende:',
    fr: 'Si vous avez sélectionné une langue autre que l\'anglais, nous pouvons afficher des sous-titres traduits par IA pendant votre consultation vidéo. Veuillez comprendre :',
    es: 'Si seleccionó un idioma que no sea inglés, podemos mostrar subtítulos traducidos por IA durante su consulta por video. Por favor comprenda:',
    ar: 'إذا اخترت لغة غير الإنجليزية، يمكننا عرض ترجمة بالذكاء الاصطناعي أثناء استشارتك عبر الفيديو. يرجى فهم:',
    hi: 'यदि आपने अंग्रेजी के अलावा कोई भाषा चुनी है, तो हम आपके वीडियो परामर्श के दौरान AI-अनुवादित उपशीर्षक दिखा सकते हैं। कृपया समझें:',
  }, // TODO cert (mi/sm)
  consent_subtitle_bullets: { en: '• Automated translation may occasionally be imperfect\n• Your provider will read important instructions in English to confirm\n• You can request a human interpreter at any time', mi: '• Ka hē pea te whakamāoritanga aunoa\n• Ka pānui tō rata i ngā tohutohu nunui i te reo Ingarihi hei whakaū\n• Ka taea e koe te tono kaiwhakamāori tangata i ngā wā katoa', sm: '• Atonu e le sa\'o i taimi ni fa\'aliliuga fa\'alelemafaufau\n• O le a faitau e lau foma\'i fa\'atonuga taua i le Igilisi e fa\'amaonia ai\n• E mafai ona e talosaga se fa\'aliliu upu i so\'o se taimi', zh: '• 自动翻译偶尔可能不完美\n• 您的医生会用英语重复重要指示以进行确认\n• 您可以随时请求人工翻译', ja: '• 自動翻訳が時々不完全な場合があります\n• 医師は重要な指示を英語でも読み上げて確認します\n• いつでも人間の通訳を依頼できます', ko: '• 자동 번역이 때때로 완벽하지 않을 수 있습니다\n• 의사는 중요한 지침을 영어로 확인합니다\n• 언제든지 사람 통역사를 요청할 수 있습니다', de: '• Automatische Übersetzung kann gelegentlich unvollkommen sein\n• Ihr Arzt liest wichtige Anweisungen auf Englisch zur Bestätigung vor\n• Sie können jederzeit einen menschlichen Dolmetscher anfordern', nl: '• Automatische vertaling kan soms onvolmaakt zijn\n• Uw zorgverlener leest belangrijke instructies in het Engels voor ter bevestiging\n• U kunt op elk moment een menselijke tolk aanvragen', fr: '• La traduction automatique peut parfois être imparfaite\n• Votre médecin lira les instructions importantes en anglais pour confirmer\n• Vous pouvez demander un interprète humain à tout moment', es: '• La traducción automática puede ser ocasionalmente imperfecta\n• Su médico leerá las instrucciones importantes en inglés para confirmar\n• Puede solicitar un intérprete humano en cualquier momento', ar: '• قد تكون الترجمة الآلية غير مثالية أحياناً\n• سيقرأ طبيبك التعليمات المهمة بالإنجليزية للتأكيد\n• يمكنك طلب مترجم بشري في أي وقت', hi: '• स्वचालित अनुवाद कभी-कभी अपूर्ण हो सकता है\n• आपका डॉक्टर पुष्टि के लिए महत्वपूर्ण निर्देश अंग्रेजी में पढ़ेगा\n• आप किसी भी समय मानव दुभाषिया का अनुरोध कर सकते हैं' }, // TODO cert (mi/sm)
  consent_subtitle_check: { en: 'I understand AI subtitles may be imperfect and I can request a human interpreter at any time.', mi: 'Kei te mārama ahau ki te kore e tino tika ngā hauraro AI, ā, ka taea e ahau te tono kaiwhakamāori tangata i ngā wā katoa.', sm: 'Ou te malamalama e atonu e le sa\'o le fa\'aliliuga AI ma e mafai ona ou talosaga se fa\'aliliu upu i so\'o se taimi.', zh: '我了解 AI 字幕可能不完美，我可以随时请求人工翻译。', ja: 'AI字幕が不完全である可能性があり、いつでも人間の通訳を依頼できることを理解しています。', ko: 'AI 자막이 완벽하지 않을 수 있으며 언제든지 사람 통역사를 요청할 수 있음을 이해합니다.', de: 'Ich verstehe, dass KI-Untertitel unvollkommen sein können und ich jederzeit einen menschlichen Dolmetscher anfordern kann.', nl: 'Ik begrijp dat AI-ondertitels onvolmaakt kunnen zijn en dat ik op elk moment een menselijke tolk kan aanvragen.', fr: 'Je comprends que les sous-titres IA peuvent être imparfaits et que je peux demander un interprète humain à tout moment.', es: 'Entiendo que los subtítulos de IA pueden ser imperfectos y que puedo solicitar un intérprete humano en cualquier momento.', ar: 'أفهم أن ترجمة الذكاء الاصطناعي قد تكون غير كاملة ويمكنني طلب مترجم بشري في أي وقت.', hi: 'मैं समझता/समझती हूं कि AI उपशीर्षक अपूर्ण हो सकते हैं और मैं किसी भी समय मानव दुभाषिया का अनुरोध कर सकता/सकती हूं।' }, // TODO cert (mi/sm)

  consent_continue_hint:{ en: 'Tick both required boxes above to continue',
    mi: 'Tirohia ngā pouaka rua e hiahiatia ana ki runga hei haere tonu', // TODO cert
    sm: 'Fa\'ailoga pusa e lua e mana\'omia i luga e fa\'aauau ai', // TODO cert
    zh: '请勾选上面两个必需的复选框以继续',
    ja: '続けるには、上記の必須ボックスを両方チェックしてください',
    ko: '계속하려면 위의 두 필수 상자에 모두 체크하세요',
    de: 'Kreuzen Sie die beiden erforderlichen Kästchen oben an, um fortzufahren',
    nl: 'Vink beide verplichte vakjes hierboven aan om door te gaan',
    fr: 'Cochez les deux cases requises ci-dessus pour continuer',
    es: 'Marque las dos casillas requeridas arriba para continuar',
    ar: 'ضع علامة على المربعين المطلوبين أعلاه للمتابعة',
    hi: 'जारी रखने के लिए ऊपर दिए गए दोनों आवश्यक बॉक्स पर टिक करें',
  },

  // ── US patient intake (terecare.com) ─────────────────────────────────────
  // Used by src/pages/us/USStart.jsx. mi/sm intentionally omitted — those
  // languages are NZ-specific and not offered in the US language picker.

  // Screen 1 — LocationGate
  us_location_title: {
    en: 'Where are you right now?',
    es: '¿Dónde se encuentra ahora mismo?',
    zh: '您现在身处何地？',
    ja: '現在、どちらにいらっしゃいますか？',
    ko: '지금 어디에 계신가요?',
    de: 'Wo befinden Sie sich gerade?',
    nl: 'Waar bent u op dit moment?',
    fr: 'Où êtes-vous en ce moment ?',
    ar: 'أين تتواجد الآن؟',
    hi: 'आप अभी कहाँ हैं?',
  },
  us_location_subtitle: {
    en: 'Our physicians can only see patients in states where they are licensed. We need to know your physical location at the time of your visit — not where you live.',
    es: 'Nuestros médicos solo pueden atender a pacientes en los estados donde están autorizados. Necesitamos conocer su ubicación física en el momento de la consulta, no dónde reside.',
    zh: '我们的医生只能为其执照所在州的患者提供诊疗。我们需要了解您就诊时的实际所在地——而非您的居住地。',
    ja: '当院の医師は、免許を保有している州に所在する患者さまのみ診療できます。ご自宅の所在地ではなく、診察時にご自身がいる場所をお知らせください。',
    ko: '저희 의사는 면허가 있는 주의 환자만 진료할 수 있습니다. 거주지가 아닌, 진료를 받으실 때 실제로 계신 위치를 알려주셔야 합니다.',
    de: 'Unsere Ärztinnen und Ärzte dürfen Patienten nur in den Bundesstaaten behandeln, in denen sie zugelassen sind. Bitte geben Sie an, wo Sie sich zum Zeitpunkt der Sprechstunde tatsächlich befinden — nicht Ihren Wohnort.',
    nl: 'Onze artsen mogen alleen patiënten behandelen in staten waar zij bevoegd zijn. We hebben uw fysieke locatie op het moment van het consult nodig — niet uw woonadres.',
    fr: 'Nos médecins ne peuvent recevoir des patients que dans les États où ils sont agréés. Nous avons besoin de votre localisation physique au moment de la consultation — et non de votre lieu de résidence.',
    ar: 'يمكن لأطبائنا استقبال المرضى فقط في الولايات التي يحملون فيها تراخيص. نحتاج إلى معرفة موقعك الفعلي وقت الاستشارة — وليس مكان إقامتك.',
    hi: 'हमारे चिकित्सक केवल उन्हीं राज्यों में मरीज़ों को देख सकते हैं जहाँ वे लाइसेंस-प्राप्त हैं। हमें आपके निवास स्थान की नहीं, बल्कि परामर्श के समय आपकी वास्तविक भौगोलिक स्थिति की जानकारी चाहिए।',
  },
  us_location_state_label: {
    en: 'Your state',
    es: 'Su estado',
    zh: '您所在的州',
    ja: 'お住まいの州',
    ko: '주 (State)',
    de: 'Ihr Bundesstaat',
    nl: 'Uw staat',
    fr: 'Votre État',
    ar: 'ولايتك',
    hi: 'आपका राज्य',
  },
  us_location_detecting: {
    en: '· detecting…',
    es: '· detectando…',
    zh: '· 检测中…',
    ja: '· 検出中…',
    ko: '· 감지 중…',
    de: '· Erkennung läuft…',
    nl: '· detecteren…',
    fr: '· détection…',
    ar: '· يتم الكشف…',
    hi: '· पहचान हो रही है…',
  },
  us_location_state_placeholder: {
    en: '— Select your state —',
    es: '— Seleccione su estado —',
    zh: '— 请选择您所在的州 —',
    ja: '— 州を選択してください —',
    ko: '— 주를 선택하세요 —',
    de: '— Bundesstaat auswählen —',
    nl: '— Selecteer uw staat —',
    fr: '— Sélectionnez votre État —',
    ar: '— اختر ولايتك —',
    hi: '— अपना राज्य चुनें —',
  },
  us_location_detected_confirm: {
    en: '✓ We detected ${stateName} from your connection. Please confirm this is where you actually are.',
    es: '✓ Detectamos ${stateName} a partir de su conexión. Confirme, por favor, que realmente se encuentra allí.',
    zh: '✓ 我们根据您的网络连接检测到您位于${stateName}。请确认这是您目前的实际所在地。',
    ja: '✓ ご利用の接続から${stateName}と判定しました。実際にその場所にいらっしゃるかご確認ください。',
    ko: '✓ 접속 정보에서 ${stateName}을(를) 감지했습니다. 실제로 그곳에 계신지 확인해 주세요.',
    de: '✓ Anhand Ihrer Verbindung haben wir ${stateName} erkannt. Bitte bestätigen Sie, dass Sie sich tatsächlich dort befinden.',
    nl: '✓ Op basis van uw verbinding hebben wij ${stateName} gedetecteerd. Bevestig alstublieft dat u zich daar daadwerkelijk bevindt.',
    fr: '✓ Nous avons détecté ${stateName} à partir de votre connexion. Veuillez confirmer que vous vous y trouvez bien.',
    ar: '✓ رصدنا ${stateName} من خلال اتصالك. يُرجى تأكيد أنك موجود بالفعل هناك.',
    hi: '✓ आपके कनेक्शन से हमने ${stateName} का पता लगाया है। कृपया पुष्टि करें कि आप वास्तव में वहीं हैं।',
  },
  us_attest_prefix: {
    en: "I'm physically in ",
    es: 'Me encuentro físicamente en ',
    zh: '我现在实际身处',
    ja: '私は現在、実際に',
    ko: '저는 지금 실제로 ',
    de: 'Ich befinde mich physisch in ',
    nl: 'Ik bevind mij fysiek in ',
    fr: 'Je me trouve physiquement en ',
    ar: 'أنا موجود فعلياً في ',
    hi: 'मैं वास्तव में ',
  },
  us_attest_suffix: {
    en: ' right now.',
    es: ' en este momento.',
    zh: '。',
    ja: 'にいます。',
    ko: '에 있습니다.',
    de: ' — genau jetzt.',
    nl: ' op dit moment.',
    fr: ' en ce moment.',
    ar: ' في هذه اللحظة.',
    hi: ' में उपस्थित हूँ।',
  },
  us_attest_fallback_location: {
    en: 'the state selected above',
    es: 'el estado seleccionado arriba',
    zh: '上方选择的州',
    ja: '上記で選択した州',
    ko: '위에서 선택한 주',
    de: 'dem oben ausgewählten Bundesstaat',
    nl: 'de hierboven geselecteerde staat',
    fr: "l'État sélectionné ci-dessus",
    ar: 'الولاية المختارة أعلاه',
    hi: 'ऊपर चुने गए राज्य',
  },
  us_continue: {
    en: 'Continue  →',
    es: 'Continuar  →',
    zh: '继续  →',
    ja: '続ける  →',
    ko: '계속하기  →',
    de: 'Weiter  →',
    nl: 'Doorgaan  →',
    fr: 'Continuer  →',
    ar: 'متابعة  ←',
    hi: 'जारी रखें  →',
  },

  // Screen 2 — HipaaGate
  us_hipaa_banner_prefix: {
    en: 'We can see you in ',
    es: 'Podemos atenderle en ',
    zh: '我们可以在',
    ja: '当院は',
    ko: '저희는 ',
    de: 'Wir können Sie in ',
    nl: 'We kunnen u ontvangen in ',
    fr: 'Nous pouvons vous recevoir en ',
    ar: 'يمكننا استقبالك في ',
    hi: 'हम आपको ',
  },
  us_hipaa_banner_suffix: {
    en: '. One quick step before we ask about your visit.',
    es: '. Un paso rápido antes de preguntarle sobre su consulta.',
    zh: '为您诊疗。在询问您的就诊详情前，还有一个简短步骤。',
    ja: 'で診察が可能です。ご相談内容を伺う前に、簡単なご確認をお願いします。',
    ko: '에서 진료를 제공할 수 있습니다. 진료 내용을 여쭙기 전에 간단한 절차가 하나 있습니다.',
    de: ' behandeln. Eine kurze Frage, bevor wir zu Ihrem Anliegen kommen.',
    nl: ' behandelen. Nog één korte stap voordat we naar uw klacht vragen.',
    fr: '. Une étape rapide avant que nous vous interrogions sur votre visite.',
    ar: '. خطوة سريعة قبل أن نسألك عن سبب زيارتك.',
    hi: 'में परामर्श दे सकते हैं। आपकी परेशानी पूछने से पहले एक छोटा-सा कदम बाकी है।',
  },
  us_hipaa_title: {
    en: 'Your privacy under HIPAA.',
    es: 'Su privacidad bajo la HIPAA.',
    zh: '您在 HIPAA 下的隐私权。',
    ja: 'HIPAAに基づくあなたのプライバシー。',
    ko: 'HIPAA에 따른 귀하의 개인정보 보호.',
    de: 'Ihre Privatsphäre gemäß HIPAA.',
    nl: 'Uw privacy onder HIPAA.',
    fr: 'Votre vie privée en vertu de la HIPAA.',
    ar: 'خصوصيتك بموجب قانون HIPAA.',
    hi: 'HIPAA के अंतर्गत आपकी गोपनीयता।',
  },
  us_hipaa_subtitle: {
    en: 'Before we collect any health information, please review how we use and protect it.',
    es: 'Antes de recopilar cualquier información de salud, revise cómo la usamos y la protegemos.',
    zh: '在收集任何健康信息之前，请查看我们如何使用和保护这些信息。',
    ja: '健康情報を収集する前に、当院がどのように利用・保護するかをご確認ください。',
    ko: '건강 정보를 수집하기 전에, 저희가 이를 어떻게 사용하고 보호하는지 확인해 주세요.',
    de: 'Bevor wir Gesundheitsdaten erheben, informieren Sie sich bitte darüber, wie wir sie nutzen und schützen.',
    nl: 'Voordat we gezondheidsgegevens verzamelen, kunt u lezen hoe we deze gebruiken en beschermen.',
    fr: 'Avant de recueillir toute information de santé, veuillez consulter la façon dont nous l’utilisons et la protégeons.',
    ar: 'قبل جمع أي معلومات صحية، يُرجى مراجعة كيفية استخدامنا لها وحمايتها.',
    hi: 'कोई भी स्वास्थ्य जानकारी एकत्र करने से पहले, कृपया पढ़ें कि हम इसका उपयोग और संरक्षण कैसे करते हैं।',
  },
  us_hipaa_bullet_1: {
    en: 'Your health info is used only for your care, payment, and our internal quality processes.',
    es: 'Su información de salud se utiliza únicamente para su atención, el pago y nuestros procesos internos de calidad.',
    zh: '您的健康信息仅用于您的治疗、付款以及我们的内部质量管理流程。',
    ja: '健康情報は診療、支払い、および当院内部の品質管理のためにのみ使用されます。',
    ko: '귀하의 건강 정보는 진료, 결제, 그리고 저희 내부 품질 관리 목적으로만 사용됩니다.',
    de: 'Ihre Gesundheitsdaten werden ausschließlich für Ihre Behandlung, die Abrechnung und unsere internen Qualitätsprozesse verwendet.',
    nl: 'Uw gezondheidsgegevens worden alleen gebruikt voor uw behandeling, betaling en onze interne kwaliteitsprocessen.',
    fr: 'Vos informations de santé ne sont utilisées que pour vos soins, le paiement et nos processus internes de qualité.',
    ar: 'تُستخدم معلوماتك الصحية فقط لأغراض الرعاية والدفع وعمليات ضمان الجودة الداخلية لدينا.',
    hi: 'आपकी स्वास्थ्य जानकारी केवल आपकी देखभाल, भुगतान और हमारी आंतरिक गुणवत्ता प्रक्रियाओं के लिए उपयोग की जाती है।',
  },
  us_hipaa_bullet_2: {
    en: 'Stored encrypted on AWS under a Business Associate Agreement — not shared with employers, insurers, or advertisers.',
    es: 'Se almacena cifrada en AWS bajo un Acuerdo de Asociado Comercial (BAA), y no se comparte con empleadores, aseguradoras ni anunciantes.',
    zh: '在 AWS 上以加密方式存储，并受《业务伙伴协议》（BAA）约束——不会与雇主、保险公司或广告商共享。',
    ja: 'AWS上でビジネスアソシエイト契約(BAA)のもと暗号化して保管され、雇用主・保険会社・広告主とは共有されません。',
    ko: 'AWS에 비즈니스 제휴 계약(BAA) 하에 암호화되어 저장되며, 고용주·보험사·광고주와 공유되지 않습니다.',
    de: 'Verschlüsselt bei AWS im Rahmen eines Business Associate Agreement gespeichert — nicht an Arbeitgeber, Versicherer oder Werbetreibende weitergegeben.',
    nl: 'Versleuteld opgeslagen bij AWS onder een Business Associate Agreement — niet gedeeld met werkgevers, verzekeraars of adverteerders.',
    fr: 'Stockées chiffrées sur AWS dans le cadre d’un Business Associate Agreement — jamais partagées avec des employeurs, assureurs ou annonceurs.',
    ar: 'يتم تخزينها مشفَّرة على AWS بموجب اتفاقية الشريك التجاري (BAA)، ولا تتم مشاركتها مع أصحاب العمل أو شركات التأمين أو المُعلنين.',
    hi: 'AWS पर व्यावसायिक सहयोगी अनुबंध (BAA) के अंतर्गत एन्क्रिप्टेड रूप में संग्रहीत — नियोक्ताओं, बीमाकर्ताओं या विज्ञापनदाताओं के साथ साझा नहीं की जाती।',
  },
  us_hipaa_bullet_3: {
    en: 'Never sold. Never used for marketing without your permission.',
    es: 'Nunca se vende. Nunca se utiliza con fines de marketing sin su permiso.',
    zh: '绝不出售。未经您的同意，绝不用于营销用途。',
    ja: '販売することは一切ありません。ご本人の許可なくマーケティング目的で使用することもありません。',
    ko: '결코 판매되지 않습니다. 귀하의 동의 없이 마케팅에 사용되지 않습니다.',
    de: 'Niemals verkauft. Niemals ohne Ihre Zustimmung für Marketing genutzt.',
    nl: 'Nooit verkocht. Nooit zonder uw toestemming voor marketing gebruikt.',
    fr: 'Jamais vendues. Jamais utilisées à des fins marketing sans votre autorisation.',
    ar: 'لا تُباع أبداً. ولا تُستخدم لأغراض تسويقية دون إذنك.',
    hi: 'कभी बेची नहीं जाती। आपकी अनुमति के बिना कभी विपणन के लिए उपयोग नहीं की जाती।',
  },
  us_hipaa_bullet_4: {
    en: 'You have the right to access your records, request amendments, and file complaints (with us or with HHS Office for Civil Rights).',
    es: 'Tiene derecho a acceder a sus registros, solicitar modificaciones y presentar quejas (ante nosotros o ante la Oficina de Derechos Civiles del HHS).',
    zh: '您有权查阅个人记录、申请更正，并向我们或美国卫生与公众服务部民权办公室（HHS OCR）提出投诉。',
    ja: 'ご自身の記録の閲覧、修正の請求、および苦情の申し立て（当院、または米国HHS公民権局宛て）を行う権利があります。',
    ko: '귀하는 본인의 기록에 접근하고, 수정 요청을 하며, 저희 또는 미국 보건복지부 민권국(HHS OCR)에 이의를 제기할 권리가 있습니다.',
    de: 'Sie haben das Recht, Ihre Unterlagen einzusehen, Berichtigungen zu verlangen und Beschwerden einzureichen (bei uns oder beim HHS Office for Civil Rights).',
    nl: 'U heeft het recht om uw dossier in te zien, wijzigingen te vragen en klachten in te dienen (bij ons of bij het HHS Office for Civil Rights).',
    fr: 'Vous avez le droit d’accéder à votre dossier, de demander des modifications et de déposer une plainte (auprès de nous ou de l’Office for Civil Rights du HHS).',
    ar: 'يحق لك الاطلاع على سجلاتك وطلب تعديلها وتقديم الشكاوى (لدينا أو لدى مكتب الحقوق المدنية التابع لوزارة HHS الأمريكية).',
    hi: 'आपको अपने रिकॉर्ड देखने, संशोधन का अनुरोध करने और शिकायत दर्ज करने का अधिकार है (हमारे साथ या HHS के Office for Civil Rights के साथ)।',
  },
  us_hipaa_bullet_5: {
    en: "We'll notify you within 60 days if a breach of your data ever occurred.",
    es: 'Le notificaremos en un plazo de 60 días si alguna vez se produce una violación de sus datos.',
    zh: '如果您的数据发生任何泄露事件，我们将在 60 天内通知您。',
    ja: '万一データ漏えいが発生した場合は、60日以内にお知らせします。',
    ko: '귀하의 데이터가 유출된 경우, 60일 이내에 알려드립니다.',
    de: 'Sollte es zu einer Verletzung Ihrer Daten kommen, benachrichtigen wir Sie innerhalb von 60 Tagen.',
    nl: 'Bij een datalek met betrekking tot uw gegevens informeren wij u binnen 60 dagen.',
    fr: 'Nous vous informerons dans les 60 jours en cas de violation de vos données.',
    ar: 'سنُبلغك خلال 60 يوماً في حال حدوث أي انتهاك لبياناتك.',
    hi: 'यदि आपके डेटा में कभी कोई उल्लंघन होता है, तो हम 60 दिनों के भीतर आपको सूचित करेंगे।',
  },
  us_hipaa_full_details_prefix: {
    en: 'For the full details: ',
    es: 'Para todos los detalles: ',
    zh: '如需了解完整详情：',
    ja: '詳細については：',
    ko: '전체 내용을 확인하시려면: ',
    de: 'Für alle Einzelheiten: ',
    nl: 'Voor alle details: ',
    fr: 'Pour tous les détails : ',
    ar: 'للاطلاع على التفاصيل الكاملة: ',
    hi: 'पूरी जानकारी के लिए: ',
  },
  us_hipaa_full_details_link: {
    en: 'Read our full Notice of Privacy Practices →',
    es: 'Lea nuestro Aviso completo de Prácticas de Privacidad →',
    zh: '阅读我们完整的《隐私实践声明》→',
    ja: 'プライバシー慣行に関する通知の全文を読む →',
    ko: '전체 개인정보 보호 관행 고지서 읽기 →',
    de: 'Vollständige Datenschutzerklärung (Notice of Privacy Practices) lesen →',
    nl: 'Lees onze volledige Notice of Privacy Practices →',
    fr: 'Lire notre Avis complet sur les pratiques de confidentialité →',
    ar: 'اقرأ إشعار ممارسات الخصوصية الكامل ←',
    hi: 'हमारा पूरा Notice of Privacy Practices पढ़ें →',
  },
  us_hipaa_ack_label: {
    en: "I acknowledge I've received and reviewed Tere Care's Notice of Privacy Practices.",
    es: 'Confirmo que he recibido y revisado el Aviso de Prácticas de Privacidad de Tere Care.',
    zh: '我确认已收到并阅读了 Tere Care 的《隐私实践声明》。',
    ja: 'Tere Careのプライバシー慣行に関する通知を受領し、確認したことを認めます。',
    ko: 'Tere Care의 개인정보 보호 관행 고지서를 수령하고 검토하였음을 확인합니다.',
    de: 'Ich bestätige, die Datenschutzerklärung (Notice of Privacy Practices) von Tere Care erhalten und gelesen zu haben.',
    nl: 'Ik bevestig dat ik de Notice of Privacy Practices van Tere Care heb ontvangen en gelezen.',
    fr: 'Je reconnais avoir reçu et lu l’Avis sur les pratiques de confidentialité de Tere Care.',
    ar: 'أُقرّ بأنني تسلّمت واطّلعت على إشعار ممارسات الخصوصية الخاص بـ Tere Care.',
    hi: 'मैं पुष्टि करता/करती हूँ कि मुझे Tere Care का Notice of Privacy Practices प्राप्त हुआ है और मैंने उसे पढ़ लिया है।',
  },
  us_wrong_state_prefix: {
    en: 'Wrong state? ',
    es: '¿Estado incorrecto? ',
    zh: '州选错了？',
    ja: '州が違いますか？',
    ko: '주가 잘못되었나요? ',
    de: 'Falscher Bundesstaat? ',
    nl: 'Verkeerde staat? ',
    fr: 'Mauvais État ? ',
    ar: 'الولاية غير صحيحة؟ ',
    hi: 'गलत राज्य? ',
  },
  us_wrong_state_link: {
    en: 'Change your state',
    es: 'Cambiar de estado',
    zh: '更改所在州',
    ja: '州を変更する',
    ko: '주 변경하기',
    de: 'Bundesstaat ändern',
    nl: 'Wijzig uw staat',
    fr: 'Changer d’État',
    ar: 'تغيير الولاية',
    hi: 'अपना राज्य बदलें',
  },

  // Screen 3a — IntakeForm
  us_intake_banner_prefix: {
    en: 'We can see you in ',
    es: 'Podemos atenderle en ',
    zh: '我们可以在',
    ja: '当院は',
    ko: '저희는 ',
    de: 'Wir können Sie in ',
    nl: 'We kunnen u ontvangen in ',
    fr: 'Nous pouvons vous recevoir en ',
    ar: 'يمكننا استقبالك في ',
    hi: 'हम आपको ',
  },
  us_intake_banner_suffix: {
    en: '.',
    es: '.',
    zh: '为您诊疗。',
    ja: 'で診察が可能です。',
    ko: '에서 진료해 드릴 수 있습니다.',
    de: ' behandeln.',
    nl: ' behandelen.',
    fr: '.',
    ar: '.',
    hi: 'में परामर्श दे सकते हैं।',
  },
  us_intake_beta: {
    en: 'Beta',
    es: 'Beta',
    zh: '测试版',
    ja: 'ベータ版',
    ko: '베타',
    de: 'Beta',
    nl: 'Bèta',
    fr: 'Bêta',
    ar: 'إصدار تجريبي',
    hi: 'बीटा',
  },
  us_intake_title: {
    en: 'Tell us a bit about you.',
    es: 'Cuéntenos un poco sobre usted.',
    zh: '请简单介绍一下您自己。',
    ja: 'あなたのことを少しお聞かせください。',
    ko: '본인에 대해 조금 알려주세요.',
    de: 'Erzählen Sie uns kurz etwas über sich.',
    nl: 'Vertel ons kort iets over uzelf.',
    fr: 'Parlez-nous un peu de vous.',
    ar: 'أخبرنا قليلاً عنك.',
    hi: 'हमें अपने बारे में थोड़ा बताएं।',
  },
  us_intake_subtitle: {
    en: "We're in early launch — a licensed physician will reach out personally to book your visit within one business day. No payment required to submit this form.",
    es: 'Estamos en fase inicial: un médico autorizado se pondrá en contacto con usted personalmente para agendar su consulta en un plazo de un día hábil. No se requiere pago para enviar este formulario.',
    zh: '我们正处于早期启动阶段——一位持照医生将在一个工作日内亲自联系您，为您安排就诊。提交此表单无需付款。',
    ja: '当院はローンチ初期の段階です。1営業日以内に、有資格の医師が直接ご連絡し、診察のご予約を承ります。このフォームの送信に費用はかかりません。',
    ko: '저희는 서비스 초기 단계입니다. 면허를 소지한 의사가 영업일 기준 1일 이내에 직접 연락드려 진료 예약을 잡아드립니다. 이 양식을 제출하는 데 결제는 필요하지 않습니다.',
    de: 'Wir sind in der frühen Startphase — eine approbierte Ärztin oder ein approbierter Arzt meldet sich innerhalb eines Werktags persönlich, um Ihren Termin zu vereinbaren. Für das Absenden dieses Formulars ist keine Zahlung erforderlich.',
    nl: 'We zijn net gestart — een bevoegde arts neemt binnen één werkdag persoonlijk contact met u op om uw consult in te plannen. Er is geen betaling nodig om dit formulier te versturen.',
    fr: 'Nous sommes en phase de lancement — un médecin agréé vous contactera personnellement dans un délai d’un jour ouvré pour fixer votre rendez-vous. Aucun paiement n’est requis pour soumettre ce formulaire.',
    ar: 'نحن في مرحلة الإطلاق المبكر — سيتواصل معك طبيب مرخّص شخصياً خلال يوم عمل واحد لتحديد موعد استشارتك. لا يلزم أي دفع لإرسال هذا النموذج.',
    hi: 'हम शुरुआती चरण में हैं — एक लाइसेंस-प्राप्त चिकित्सक एक कार्यदिवस के भीतर व्यक्तिगत रूप से संपर्क करके आपकी विज़िट तय करेंगे। यह फ़ॉर्म भेजने के लिए किसी भुगतान की आवश्यकता नहीं है।',
  },
  us_intake_name_label: {
    en: 'Full name',
    es: 'Nombre completo',
    zh: '姓名',
    ja: '氏名（フルネーム）',
    ko: '성함',
    de: 'Vollständiger Name',
    nl: 'Volledige naam',
    fr: 'Nom complet',
    ar: 'الاسم الكامل',
    hi: 'पूरा नाम',
  },
  us_intake_email_label: {
    en: 'Email',
    es: 'Correo electrónico',
    zh: '电子邮件',
    ja: 'メールアドレス',
    ko: '이메일',
    de: 'E-Mail',
    nl: 'E-mail',
    fr: 'E-mail',
    ar: 'البريد الإلكتروني',
    hi: 'ईमेल',
  },
  us_intake_mobile_label: {
    en: 'Mobile',
    es: 'Móvil',
    zh: '手机号码',
    ja: '携帯電話番号',
    ko: '휴대폰',
    de: 'Mobilnummer',
    nl: 'Mobiel',
    fr: 'Mobile',
    ar: 'الهاتف المحمول',
    hi: 'मोबाइल',
  },
  us_intake_mobile_optional: {
    en: '(optional but faster)',
    es: '(opcional, pero más rápido)',
    zh: '（可选，但更快）',
    ja: '（任意ですが、より迅速にご対応できます）',
    ko: '(선택 사항이나 더 빠릅니다)',
    de: '(optional, aber schneller)',
    nl: '(optioneel, maar sneller)',
    fr: '(facultatif, mais plus rapide)',
    ar: '(اختياري ولكنه أسرع)',
    hi: '(वैकल्पिक, परंतु तेज़)',
  },
  us_intake_complaint_label: {
    en: "What's going on?",
    es: '¿Qué le sucede?',
    zh: '您有什么不适？',
    ja: 'どのような症状ですか？',
    ko: '어떤 증상이 있으신가요?',
    de: 'Was ist das Anliegen?',
    nl: 'Wat is er aan de hand?',
    fr: 'Que se passe-t-il ?',
    ar: 'ما الذي تعانيه؟',
    hi: 'क्या हो रहा है?',
  },
  us_intake_complaint_placeholder: {
    en: "Brief description of what you're experiencing (UTI symptoms, cold, minor injury, prescription refill, etc.)",
    es: 'Breve descripción de lo que le está sucediendo (síntomas de infección urinaria, resfriado, lesión leve, renovación de receta, etc.)',
    zh: '简要描述您的症状（例如：尿路感染症状、感冒、轻微外伤、处方续药等）',
    ja: '現在の症状を簡潔にご記入ください（例：尿路感染症の症状、風邪、軽度のけが、処方箋のリフィルなど）',
    ko: '현재 겪고 계신 증상을 간단히 적어주세요 (예: 요로 감염 증상, 감기, 경미한 부상, 처방전 재발급 등)',
    de: 'Kurze Beschreibung Ihrer Beschwerden (z. B. Harnwegsinfekt-Symptome, Erkältung, kleinere Verletzung, Rezept-Nachbestellung usw.)',
    nl: 'Korte beschrijving van uw klachten (bijv. symptomen van een blaasontsteking, verkoudheid, lichte verwonding, herhaalrecept, enz.)',
    fr: 'Brève description de ce que vous ressentez (symptômes d’infection urinaire, rhume, blessure légère, renouvellement d’ordonnance, etc.)',
    ar: 'وصف موجز لما تعاني منه (أعراض التهاب المسالك البولية، نزلة برد، إصابة طفيفة، تجديد وصفة طبية، إلخ)',
    hi: 'आप जो अनुभव कर रहे हैं उसका संक्षिप्त विवरण (जैसे UTI लक्षण, सर्दी-ज़ुकाम, मामूली चोट, दवा फिर से लिखवाना आदि)',
  },
  us_intake_submit_error: {
    en: 'Sorry — something went wrong submitting your details. Please try again or email hello@terecare.com directly.',
    es: 'Lo sentimos: hubo un problema al enviar sus datos. Vuelva a intentarlo o escríbanos directamente a hello@terecare.com.',
    zh: '抱歉——提交您的信息时出现问题。请重试，或直接发送邮件至 hello@terecare.com。',
    ja: '申し訳ありません。ご入力内容の送信中に問題が発生しました。もう一度お試しいただくか、hello@terecare.com まで直接メールでご連絡ください。',
    ko: '죄송합니다. 정보를 제출하는 중 문제가 발생했습니다. 다시 시도하시거나 hello@terecare.com 으로 직접 이메일을 보내주세요.',
    de: 'Entschuldigung — beim Absenden Ihrer Angaben ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder schreiben Sie direkt an hello@terecare.com.',
    nl: 'Sorry — er is iets misgegaan bij het versturen van uw gegevens. Probeer het opnieuw of stuur een e-mail rechtstreeks naar hello@terecare.com.',
    fr: 'Désolé — un problème est survenu lors de l’envoi de vos informations. Veuillez réessayer ou écrire directement à hello@terecare.com.',
    ar: 'نأسف — حدثت مشكلة أثناء إرسال بياناتك. يُرجى المحاولة مرة أخرى أو مراسلتنا مباشرة على hello@terecare.com.',
    hi: 'क्षमा करें — आपकी जानकारी भेजते समय कुछ गड़बड़ हुई। कृपया पुनः प्रयास करें या सीधे hello@terecare.com पर ईमेल करें।',
  },
  us_sending: {
    en: 'Sending…',
    es: 'Enviando…',
    zh: '发送中…',
    ja: '送信中…',
    ko: '보내는 중…',
    de: 'Wird gesendet…',
    nl: 'Verzenden…',
    fr: 'Envoi en cours…',
    ar: 'جارٍ الإرسال…',
    hi: 'भेजा जा रहा है…',
  },
  us_intake_send: {
    en: 'Send my details →',
    es: 'Enviar mis datos →',
    zh: '发送我的信息 →',
    ja: '入力内容を送信 →',
    ko: '내 정보 보내기 →',
    de: 'Meine Angaben senden →',
    nl: 'Mijn gegevens versturen →',
    fr: 'Envoyer mes informations →',
    ar: 'إرسال بياناتي ←',
    hi: 'मेरी जानकारी भेजें →',
  },
  us_intake_emergency_prefix: {
    en: 'Not for emergencies.',
    es: 'No es para emergencias.',
    zh: '本服务不适用于紧急情况。',
    ja: '緊急時にはご利用いただけません。',
    ko: '응급 상황에는 사용하실 수 없습니다.',
    de: 'Nicht für Notfälle geeignet.',
    nl: 'Niet bedoeld voor noodgevallen.',
    fr: 'Ce service n’est pas destiné aux urgences.',
    ar: 'هذه الخدمة ليست مخصصة لحالات الطوارئ.',
    hi: 'यह आपातकालीन उपयोग के लिए नहीं है।',
  },
  us_intake_emergency_body_prefix: {
    en: ' If you have chest pain, breathing difficulty, severe bleeding, or any life-threatening symptom, call ',
    es: ' Si presenta dolor en el pecho, dificultad para respirar, hemorragia grave o cualquier síntoma que ponga en riesgo su vida, llame al ',
    zh: ' 如果您出现胸痛、呼吸困难、大出血或任何危及生命的症状，请拨打 ',
    ja: ' 胸の痛み、呼吸困難、大量出血など、生命に関わる症状がある場合は、',
    ko: ' 흉통, 호흡 곤란, 심한 출혈 또는 생명을 위협하는 증상이 있으시면 ',
    de: ' Bei Brustschmerzen, Atemnot, starken Blutungen oder anderen lebensbedrohlichen Symptomen rufen Sie ',
    nl: ' Bij pijn op de borst, ademhalingsproblemen, ernstige bloedingen of andere levensbedreigende klachten belt u ',
    fr: ' En cas de douleur thoracique, de difficulté respiratoire, de saignement grave ou de tout symptôme mettant la vie en danger, composez le ',
    ar: ' في حال معاناتك من ألم في الصدر أو صعوبة في التنفس أو نزيف شديد أو أي عرض يُهدّد الحياة، فاتصل بالرقم ',
    hi: ' यदि आपको सीने में दर्द, सांस लेने में कठिनाई, तेज़ रक्तस्राव या कोई जानलेवा लक्षण है, तो ',
  },
  us_intake_emergency_body_suffix: {
    en: ' or go to your nearest ER.',
    es: ' o acuda a la sala de urgencias más cercana.',
    zh: '，或立即前往最近的急诊室。',
    ja: 'に電話するか、最寄りの救急外来（ER）へお越しください。',
    ko: '(으)로 전화하시거나 가장 가까운 응급실(ER)로 가시기 바랍니다.',
    de: ' an oder begeben Sie sich in die nächstgelegene Notaufnahme.',
    nl: ' of ga naar de dichtstbijzijnde spoedeisende hulp.',
    fr: ' ou rendez-vous aux urgences les plus proches.',
    ar: ' أو توجّه إلى أقرب قسم للطوارئ.',
    hi: ' पर कॉल करें या निकटतम आपातकालीन कक्ष (ER) जाएँ।',
  },

  // Screen 3b — WaitlistForm
  us_waitlist_banner_bold: {
    en: 'Not yet licensed in ${stateName}.',
    es: 'Aún no tenemos licencia en ${stateName}.',
    zh: '尚未在${stateName}获得执业许可。',
    ja: '${stateName}ではまだ免許を取得していません。',
    ko: '아직 ${stateName}에서 면허를 취득하지 않았습니다.',
    de: 'Wir sind in ${stateName} noch nicht zugelassen.',
    nl: 'Nog niet bevoegd in ${stateName}.',
    fr: 'Non encore agréés en ${stateName}.',
    ar: 'لم نحصل بعد على ترخيص في ${stateName}.',
    hi: '${stateName} में अभी तक लाइसेंस नहीं है।',
  },
  us_waitlist_banner_rest: {
    en: " We can only see patients in states where our physicians are actively licensed. We're expanding — leave your details and we'll email you the moment we're live in your state.",
    es: ' Solo podemos atender a pacientes en los estados donde nuestros médicos están autorizados de forma activa. Estamos expandiéndonos: déjenos sus datos y le enviaremos un correo en cuanto estemos disponibles en su estado.',
    zh: ' 我们只能为医生持有有效执照的州的患者提供服务。我们正在扩展中——请留下您的信息，一旦我们在您的州上线，我们会立即发送邮件通知您。',
    ja: ' 当院は、医師が現在免許を保有している州の患者さまのみ診察が可能です。対応地域を拡大中ですので、ご連絡先をお知らせいただければ、あなたの州でサービス開始した際にすぐメールでお知らせします。',
    ko: ' 저희는 의사가 현재 유효한 면허를 보유한 주에 계신 환자만 진료할 수 있습니다. 서비스 지역을 확대하고 있으니, 정보를 남겨주시면 해당 주에서 서비스가 시작되는 즉시 이메일로 알려드리겠습니다.',
    de: ' Wir können Patienten nur in Bundesstaaten behandeln, in denen unsere Ärztinnen und Ärzte aktiv zugelassen sind. Wir bauen weiter aus — hinterlassen Sie Ihre Daten, und wir informieren Sie per E-Mail, sobald wir in Ihrem Bundesstaat verfügbar sind.',
    nl: ' We kunnen alleen patiënten behandelen in staten waar onze artsen actief bevoegd zijn. We breiden uit — laat uw gegevens achter en wij mailen u zodra wij in uw staat beschikbaar zijn.',
    fr: ' Nous ne pouvons recevoir des patients que dans les États où nos médecins sont activement agréés. Nous nous développons — laissez-nous vos coordonnées et nous vous enverrons un e-mail dès que nous serons disponibles dans votre État.',
    ar: ' يمكننا استقبال المرضى فقط في الولايات التي يحمل فيها أطباؤنا تراخيص سارية. نحن في مرحلة توسّع — اترك بياناتك وسنراسلك عبر البريد الإلكتروني فور بدء عملنا في ولايتك.',
    hi: ' हम केवल उन्हीं राज्यों में मरीज़ों को देख सकते हैं जहाँ हमारे चिकित्सक सक्रिय रूप से लाइसेंस-प्राप्त हैं। हम विस्तार कर रहे हैं — अपनी जानकारी छोड़ दें और जैसे ही हम आपके राज्य में उपलब्ध होंगे, हम आपको ईमेल कर देंगे।',
  },
  us_waitlist_title: {
    en: 'Join the waitlist.',
    es: 'Únase a la lista de espera.',
    zh: '加入候补名单。',
    ja: 'ウェイトリストにご登録ください。',
    ko: '대기자 명단에 등록하세요.',
    de: 'Auf die Warteliste setzen lassen.',
    nl: 'Meld u aan voor de wachtlijst.',
    fr: 'Rejoignez la liste d’attente.',
    ar: 'انضم إلى قائمة الانتظار.',
    hi: 'प्रतीक्षा सूची में शामिल हों।',
  },
  us_waitlist_subtitle: {
    en: "Two fields — no obligation. We'll only email you when Tere Care launches in ${stateName}.",
    es: 'Dos campos, sin compromiso. Le enviaremos un correo únicamente cuando Tere Care esté disponible en ${stateName}.',
    zh: '仅需填写两项——不承担任何义务。我们只会在 Tere Care 在${stateName}上线时发送邮件通知您。',
    ja: '入力は2項目のみ、いかなる義務も生じません。Tere Careが${stateName}でサービスを開始した際にのみメールでお知らせします。',
    ko: '입력 항목은 두 개뿐이며 어떤 의무도 없습니다. Tere Care가 ${stateName}에서 서비스를 시작할 때에만 이메일을 보내드립니다.',
    de: 'Zwei Felder — unverbindlich. Wir schreiben Sie nur an, wenn Tere Care in ${stateName} verfügbar ist.',
    nl: 'Twee velden — geheel vrijblijvend. Wij mailen u alleen wanneer Tere Care beschikbaar komt in ${stateName}.',
    fr: 'Deux champs — sans engagement. Nous vous écrirons uniquement lorsque Tere Care sera disponible en ${stateName}.',
    ar: 'حقلان فقط — دون أي التزام. سنراسلك عبر البريد الإلكتروني فقط عند إطلاق Tere Care في ${stateName}.',
    hi: 'सिर्फ़ दो फ़ील्ड — कोई बाध्यता नहीं। हम आपको केवल तभी ईमेल करेंगे जब Tere Care ${stateName} में शुरू होगा।',
  },
  us_waitlist_name_label: {
    en: 'Name',
    es: 'Nombre',
    zh: '姓名',
    ja: 'お名前',
    ko: '이름',
    de: 'Name',
    nl: 'Naam',
    fr: 'Nom',
    ar: 'الاسم',
    hi: 'नाम',
  },
  us_waitlist_submit_error: {
    en: 'Sorry — something went wrong. Please try again or email hello@terecare.com directly.',
    es: 'Lo sentimos: algo salió mal. Vuelva a intentarlo o escríbanos directamente a hello@terecare.com.',
    zh: '抱歉——出现了问题。请重试，或直接发送邮件至 hello@terecare.com。',
    ja: '申し訳ありません。問題が発生しました。もう一度お試しいただくか、hello@terecare.com まで直接メールでご連絡ください。',
    ko: '죄송합니다. 문제가 발생했습니다. 다시 시도하시거나 hello@terecare.com 으로 직접 이메일을 보내주세요.',
    de: 'Entschuldigung — etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie direkt an hello@terecare.com.',
    nl: 'Sorry — er is iets misgegaan. Probeer het opnieuw of stuur een e-mail rechtstreeks naar hello@terecare.com.',
    fr: 'Désolé — un problème est survenu. Veuillez réessayer ou écrire directement à hello@terecare.com.',
    ar: 'نأسف — حدثت مشكلة ما. يُرجى المحاولة مرة أخرى أو مراسلتنا مباشرة على hello@terecare.com.',
    hi: 'क्षमा करें — कुछ गड़बड़ हो गई। कृपया पुनः प्रयास करें या सीधे hello@terecare.com पर ईमेल करें।',
  },
  us_waitlist_send: {
    en: 'Add me to the waitlist →',
    es: 'Añadirme a la lista de espera →',
    zh: '将我加入候补名单 →',
    ja: 'ウェイトリストに追加する →',
    ko: '대기자 명단에 등록하기 →',
    de: 'Auf die Warteliste setzen →',
    nl: 'Zet mij op de wachtlijst →',
    fr: 'M’ajouter à la liste d’attente →',
    ar: 'أضِفني إلى قائمة الانتظار ←',
    hi: 'मुझे प्रतीक्षा सूची में जोड़ें →',
  },

  // Screen 4 — Confirmation
  us_done_title_intake: {
    en: "Thanks — we've got it.",
    es: 'Gracias — hemos recibido su solicitud.',
    zh: '谢谢——我们已收到您的信息。',
    ja: 'ありがとうございます。ご入力を受け付けました。',
    ko: '감사합니다. 정보를 확인했습니다.',
    de: 'Danke — wir haben Ihre Angaben erhalten.',
    nl: 'Bedankt — we hebben uw gegevens ontvangen.',
    fr: 'Merci — nous avons bien reçu vos informations.',
    ar: 'شكراً لك — تم استلام بياناتك.',
    hi: 'धन्यवाद — हमें आपकी जानकारी मिल गई है।',
  },
  us_done_title_waitlist: {
    en: "You're on the list.",
    es: 'Está en la lista.',
    zh: '您已加入候补名单。',
    ja: 'ウェイトリストにご登録いただきました。',
    ko: '대기자 명단에 등록되셨습니다.',
    de: 'Sie stehen auf der Warteliste.',
    nl: 'U staat op de wachtlijst.',
    fr: 'Vous êtes sur la liste.',
    ar: 'تمّت إضافتك إلى القائمة.',
    hi: 'आप सूची में शामिल हैं।',
  },
  us_done_body_intake: {
    en: 'A licensed physician will reach out within one business day to schedule your visit. Check your email — you may get a confirmation from hello@terecare.com.',
    es: 'Un médico autorizado se pondrá en contacto con usted en un plazo de un día hábil para agendar su consulta. Revise su correo electrónico — es posible que reciba una confirmación desde hello@terecare.com.',
    zh: '一位持照医生将在一个工作日内与您联系，安排您的就诊。请查看您的电子邮件——您可能会收到来自 hello@terecare.com 的确认信。',
    ja: '1営業日以内に、有資格の医師が診察のご予約のためにご連絡いたします。hello@terecare.com から確認メールが届く場合がありますので、メールをご確認ください。',
    ko: '영업일 기준 1일 이내에 면허를 소지한 의사가 진료 예약을 위해 연락드립니다. 이메일을 확인해 주세요 — hello@terecare.com 에서 확인 메일이 발송될 수 있습니다.',
    de: 'Innerhalb eines Werktags meldet sich eine approbierte Ärztin oder ein approbierter Arzt bei Ihnen, um den Termin zu vereinbaren. Prüfen Sie Ihr E-Mail-Postfach — Sie erhalten möglicherweise eine Bestätigung von hello@terecare.com.',
    nl: 'Een bevoegde arts neemt binnen één werkdag contact op om uw consult in te plannen. Controleer uw e-mail — u kunt een bevestiging ontvangen van hello@terecare.com.',
    fr: 'Un médecin agréé vous contactera dans un délai d’un jour ouvré pour fixer votre rendez-vous. Consultez votre boîte e-mail — vous recevrez peut-être une confirmation de hello@terecare.com.',
    ar: 'سيتواصل معك طبيب مرخّص خلال يوم عمل واحد لتحديد موعد استشارتك. تحقّق من بريدك الإلكتروني — قد يصلك تأكيد من hello@terecare.com.',
    hi: 'एक कार्यदिवस के भीतर एक लाइसेंस-प्राप्त चिकित्सक आपसे विज़िट तय करने के लिए संपर्क करेंगे। अपना ईमेल देखें — आपको hello@terecare.com से एक पुष्टिकरण मिल सकता है।',
  },
  us_done_body_waitlist: {
    en: "We'll email you the moment Tere Care goes live in your state. No spam, no follow-up unless you want it.",
    es: 'Le enviaremos un correo en cuanto Tere Care esté disponible en su estado. Sin spam ni seguimientos, salvo que usted lo desee.',
    zh: '一旦 Tere Care 在您所在的州上线，我们会立即通过邮件通知您。不会发送垃圾邮件，除非您愿意，否则不会再有后续联络。',
    ja: 'Tere Careがあなたの州でサービスを開始した瞬間にメールでお知らせします。スパムを送ることはなく、ご希望がない限りその後のご連絡もいたしません。',
    ko: 'Tere Care가 귀하의 주에서 서비스를 시작하는 즉시 이메일로 알려드립니다. 스팸을 보내지 않으며, 원하지 않으시면 추가 연락도 드리지 않습니다.',
    de: 'Wir informieren Sie per E-Mail, sobald Tere Care in Ihrem Bundesstaat verfügbar ist. Kein Spam und keine weitere Kontaktaufnahme — es sei denn, Sie wünschen es.',
    nl: 'We mailen u zodra Tere Care beschikbaar is in uw staat. Geen spam, geen verdere berichten tenzij u dat wilt.',
    fr: 'Nous vous enverrons un e-mail dès que Tere Care sera disponible dans votre État. Pas de spam, pas de relance, sauf si vous le souhaitez.',
    ar: 'سنراسلك عبر البريد الإلكتروني فور إطلاق Tere Care في ولايتك. لا رسائل مزعجة، ولا متابعات إلا إذا رغبت في ذلك.',
    hi: 'जैसे ही Tere Care आपके राज्य में उपलब्ध होगा, हम आपको ईमेल कर देंगे। कोई स्पैम नहीं, और जब तक आप न चाहें, कोई फ़ॉलो-अप नहीं।',
  },
  us_done_back_home: {
    en: 'Back to home',
    es: 'Volver al inicio',
    zh: '返回首页',
    ja: 'ホームに戻る',
    ko: '홈으로 돌아가기',
    de: 'Zurück zur Startseite',
    nl: 'Terug naar de startpagina',
    fr: 'Retour à l’accueil',
    ar: 'العودة إلى الصفحة الرئيسية',
    hi: 'मुख्य पृष्ठ पर वापस जाएँ',
  },
}

/**
 * Get a translated string. Template vars like ${firstName} are replaced.
 * Falls back to English, then to the key itself.
 */
export function t(id, lang = 'en', vars = {}) {
  const entry = T[id]
  if (!entry) return id
  const str = entry[lang] || entry.en || id
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`\${${k}}`, v ?? ''), str)
}

/**
 * Bilingual translation for safety-critical messages (e.g. red flag warnings).
 * When Te Reo Māori is selected, always append the English fallback so no
 * critical warning is ever shown in Te Reo only — safety requirement from the
 * Te Reo launch. Other languages already carry their full translation.
 */
export function t_bilingual(id, lang = 'en', vars = {}) {
  const primary = t(id, lang, vars)
  if (lang !== 'mi') return primary
  const en = t(id, 'en', vars)
  return en === primary ? primary : `${primary} — ${en}`
}
