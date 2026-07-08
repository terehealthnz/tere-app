export const LANGUAGES = [
  { code: 'en', name: 'English',       nativeName: 'English',       flag: '🇬🇧', rtl: false },
  { code: 'mi', name: 'Te Reo Māori',  nativeName: 'Te Reo Māori',  flag: '🇳🇿', rtl: false,
    // Custom Tino Rangatiratanga SVG rendered where consumers opt-in (patient selector, provider views).
    customFlag: 'MaoriFlagIcon',
    note: 'He rereke ētahi kupu hauora — Some medical terms remain in English' },
  { code: 'zh', name: 'Chinese',  nativeName: '中文',       flag: '🇨🇳', rtl: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語',     flag: '🇯🇵', rtl: false },
  { code: 'ko', name: 'Korean',   nativeName: '한국어',     flag: '🇰🇷', rtl: false },
  { code: 'de', name: 'German',   nativeName: 'Deutsch',    flag: '🇩🇪', rtl: false },
  { code: 'fr', name: 'French',   nativeName: 'Français',   flag: '🇫🇷', rtl: false },
  { code: 'es', name: 'Spanish',  nativeName: 'Español',    flag: '🇪🇸', rtl: false },
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',    flag: '🇸🇦', rtl: true  },
  { code: 'hi', name: 'Hindi',    nativeName: 'हिन्दी',    flag: '🇮🇳', rtl: false },
  // NZ Pacific + refugee community languages. Translation quality varies:
  // Samoan is well-supported; Marshallese and Rohingya rely on Claude only.
  { code: 'sm',  name: 'Samoan',      nativeName: 'Gagana Sāmoa',   flag: '🇼🇸', rtl: false },
  { code: 'mh',  name: 'Marshallese', nativeName: 'Kajin M̧ajeļ',    flag: '🇲🇭', rtl: false,
    note: 'AI translation may be limited — a human interpreter is recommended for complex conversations' },
  // Rohingya are a stateless people; no state flag used out of respect.
  { code: 'rhg', name: 'Rohingya',    nativeName: 'Ruáingga',       flag: '🕊️', rtl: false,
    note: 'AI translation may be limited — a human interpreter is recommended for complex conversations' },
]

export function getLang() {
  return sessionStorage.getItem('patient_language') || 'en'
}

export function getLangMeta(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
}

// ─── Translation table ────────────────────────────────────────────────────────
const T = {
  // ── Triage questions ──────────────────────────────────────────────────────
  greeting: {
    en: "Kia ora! I'm Tere, your health assistant. What's your full name?",
    zh: "你好！我是Tere，您的健康助手。请问您的全名是什么？",
    ja: "こんにちは！私はTere、あなたの健康アシスタントです。お名前（フルネーム）を教えてください。",
    ko: "안녕하세요! 저는 Tere, 당신의 건강 어시스턴트입니다. 성함이 어떻게 되십니까?",
    de: "Hallo! Ich bin Tere, Ihr Gesundheitsassistent. Wie ist Ihr vollständiger Name?",
    fr: "Bonjour ! Je suis Tere, votre assistant santé. Quel est votre nom complet ?",
    es: "¡Hola! Soy Tere, tu asistente de salud. ¿Cuál es tu nombre completo?",
    ar: "مرحباً! أنا Tere، مساعدك الصحي. ما اسمك الكامل؟",
    hi: "नमस्ते! मैं Tere हूँ, आपका स्वास्थ्य सहायक। आपका पूरा नाम क्या है?",
  },
  greeting_error: {
    en: "Can you type your full name?",
    zh: "请您输入全名？",
    ja: "フルネームを入力してください。",
    ko: "성함을 전부 입력해 주세요.",
    de: "Können Sie Ihren vollständigen Namen eingeben?",
    fr: "Pouvez-vous entrer votre nom complet ?",
    es: "¿Puede escribir su nombre completo?",
    ar: "هل يمكنك كتابة اسمك الكامل؟",
    hi: "कृपया अपना पूरा नाम लिखें।",
  },

  dob_question: {
    en: "And your date of birth, ${firstName}? (e.g. 14 March 1986)",
    zh: "${firstName}，您的出生日期是什么？（例如：1986年3月14日）",
    ja: "${firstName}さん、生年月日を教えてください。（例：1986年3月14日）",
    ko: "${firstName}님, 생년월일이 어떻게 되십니까? (예: 1986년 3월 14일)",
    de: "Und Ihr Geburtsdatum, ${firstName}? (z.B. 14. März 1986)",
    fr: "Et votre date de naissance, ${firstName} ? (ex. 14 mars 1986)",
    es: "¿Y su fecha de nacimiento, ${firstName}? (ej. 14 de marzo de 1986)",
    ar: "وتاريخ ميلادك يا ${firstName}؟ (مثلاً: 14 مارس 1986)",
    hi: "और आपकी जन्म तिथि, ${firstName}? (जैसे: 14 मार्च 1986)",
  },
  dob_error: {
    en: "Can you give me your date of birth? (e.g. 14 March 1986)",
    zh: "请告诉我您的出生日期？（例如：1986年3月14日）",
    ja: "生年月日を教えてください。（例：1986年3月14日）",
    ko: "생년월일을 알려주시겠습니까? (예: 1986년 3월 14일)",
    de: "Können Sie mir Ihr Geburtsdatum nennen? (z.B. 14. März 1986)",
    fr: "Pouvez-vous me donner votre date de naissance ? (ex. 14 mars 1986)",
    es: "¿Puede darme su fecha de nacimiento? (ej. 14 de marzo de 1986)",
    ar: "هل يمكنك إعطائي تاريخ ميلادك؟ (مثلاً: 14 مارس 1986)",
    hi: "क्या आप अपनी जन्म तिथि बता सकते हैं? (जैसे: 14 मार्च 1986)",
  },

  phone: {
    en: "What's your mobile number?",
    zh: "您的手机号码是什么？",
    ja: "携帯電話番号を教えてください。",
    ko: "휴대폰 번호가 어떻게 되십니까?",
    de: "Wie ist Ihre Handynummer?",
    fr: "Quel est votre numéro de portable ?",
    es: "¿Cuál es su número de móvil?",
    ar: "ما هو رقم هاتفك المحمول؟",
    hi: "आपका मोबाइल नंबर क्या है?",
  },
  phone_error: {
    en: "Can you pop in your mobile number?",
    zh: "请输入您的手机号码。",
    ja: "携帯電話番号を入力してください。",
    ko: "휴대폰 번호를 입력해 주세요.",
    de: "Können Sie Ihre Handynummer eingeben?",
    fr: "Pouvez-vous entrer votre numéro de portable ?",
    es: "¿Puede ingresar su número de móvil?",
    ar: "هل يمكنك إدخال رقم هاتفك المحمول؟",
    hi: "कृपया अपना मोबाइल नंबर दर्ज करें।",
  },

  email: {
    en: "What's your email? We'll send your consultation summary there.",
    zh: "您的电子邮件地址是什么？我们将把会诊摘要发送到那里。",
    ja: "メールアドレスを教えてください。診察の要約をそちらに送ります。",
    ko: "이메일 주소가 어떻게 되십니까? 상담 요약을 그곳으로 보내드리겠습니다.",
    de: "Wie ist Ihre E-Mail-Adresse? Wir senden Ihnen die Zusammenfassung dorthin.",
    fr: "Quelle est votre adresse e-mail ? Nous vous y enverrons le résumé de la consultation.",
    es: "¿Cuál es su correo electrónico? Le enviaremos el resumen de la consulta allí.",
    ar: "ما هو بريدك الإلكتروني؟ سنرسل ملخص استشارتك إليه.",
    hi: "आपका ईमेल क्या है? हम आपका परामर्श सारांश वहाँ भेजेंगे।",
  },
  email_error: {
    en: "Can you double-check that email address?",
    zh: "请再次检查您的电子邮件地址。",
    ja: "メールアドレスをご確認ください。",
    ko: "이메일 주소를 다시 확인해 주세요.",
    de: "Können Sie diese E-Mail-Adresse nochmals überprüfen?",
    fr: "Pouvez-vous vérifier cette adresse e-mail ?",
    es: "¿Puede verificar esa dirección de correo electrónico?",
    ar: "هل يمكنك التحقق من عنوان البريد الإلكتروني مرة أخرى؟",
    hi: "कृपया उस ईमेल पते को दोबारा जांचें।",
  },

  nhi: {
    en: "Do you know your NHI number? It's on your Community Services Card or any hospital letter — looks like ABC1234.",
    zh: "您知道您的NHI编号吗？它在您的社区服务卡或医院信件上，格式如ABC1234。",
    ja: "NHI番号はご存知ですか？コミュニティサービスカードや病院の手紙に記載されています（例：ABC1234）。",
    ko: "NHI 번호를 알고 계십니까? 커뮤니티 서비스 카드나 병원 편지에 있습니다 (예: ABC1234).",
    de: "Kennen Sie Ihre NHI-Nummer? Sie steht auf Ihrer Community Services Card oder einem Krankenhausbrief — sieht aus wie ABC1234.",
    fr: "Connaissez-vous votre numéro NHI ? Il figure sur votre carte de services communautaires ou toute lettre d'hôpital — ressemble à ABC1234.",
    es: "¿Conoce su número NHI? Está en su Tarjeta de Servicios Comunitarios o en cualquier carta del hospital — parece ABC1234.",
    ar: "هل تعرف رقم NHI الخاص بك؟ إنه موجود على بطاقة خدمات المجتمع أو أي رسالة مستشفى — يبدو مثل ABC1234.",
    hi: "क्या आप अपना NHI नंबर जानते हैं? यह आपके कम्युनिटी सर्विसेज कार्ड या किसी अस्पताल पत्र पर होता है — जैसे ABC1234।",
  },

  pharmacy: {
    en: "What's your preferred pharmacy? (e.g. Havelock Pharmacy)",
    zh: "您首选的药店是哪家？（例如：Havelock Pharmacy）",
    ja: "お好みの薬局はどこですか？（例：Havelock Pharmacy）",
    ko: "선호하시는 약국이 어디입니까? (예: Havelock Pharmacy)",
    de: "Was ist Ihre bevorzugte Apotheke? (z.B. Havelock Pharmacy)",
    fr: "Quelle est votre pharmacie préférée ? (ex. Havelock Pharmacy)",
    es: "¿Cuál es su farmacia preferida? (ej. Havelock Pharmacy)",
    ar: "ما هي صيدليتك المفضلة؟ (مثلاً: Havelock Pharmacy)",
    hi: "आपकी पसंदीदा फार्मेसी कौन सी है? (जैसे: Havelock Pharmacy)",
  },

  complaint: {
    en: "What's brought you in today? Tell me what's going on — including how long it's been happening.",
    mi: "He aha tō raruraru i tēnei rā? Kōrero mai — me pēhea te roa o tēnei raruraru.",
    zh: "今天是什么原因来就诊？请告诉我发生了什么——包括已经持续多久了。",
    ja: "本日はどのようなことでお越しですか？症状がいつ頃から続いているかも含めて教えてください。",
    ko: "오늘 오신 이유가 무엇입니까? 얼마나 됐는지 포함해서 무슨 일인지 말씀해 주세요.",
    de: "Was führt Sie heute zu uns? Erzählen Sie mir, was los ist — und wie lange das schon so ist.",
    fr: "Qu'est-ce qui vous amène aujourd'hui ? Dites-moi ce qui se passe — y compris depuis combien de temps.",
    es: "¿Qué le trae hoy? Cuénteme qué está pasando, incluido cuánto tiempo lleva así.",
    ar: "ما الذي جاء بك اليوم؟ أخبرني بما يحدث — بما في ذلك المدة التي مضت على ذلك.",
    hi: "आज आप किस कारण से आए हैं? मुझे बताएं क्या हो रहा है — यह कितने समय से हो रहा है इसमें शामिल करें।",
  },
  complaint_error: {
    en: "Can you tell me a bit more?",
    zh: "您能告诉我多一点吗？",
    ja: "もう少し詳しく教えてもらえますか？",
    ko: "조금 더 말씀해 주시겠습니까?",
    de: "Können Sie mir etwas mehr erzählen?",
    fr: "Pouvez-vous m'en dire un peu plus ?",
    es: "¿Puede contarme un poco más?",
    ar: "هل يمكنك إخباري بمزيد من التفاصيل؟",
    hi: "क्या आप मुझे थोड़ा और बता सकते हैं?",
  },

  history: {
    en: "Any relevant medical history? Past conditions, surgeries — say none if not.",
    zh: "有什么相关的病史吗？过去的病症、手术——没有的话请说「无」。",
    ja: "関連する病歴はありますか？過去の病気、手術など。なければ「なし」と入力してください。",
    ko: "관련 병력이 있으십니까? 과거 질병, 수술 등 — 없으시면 '없음'이라고 하세요.",
    de: "Gibt es relevante Krankengeschichte? Frühere Erkrankungen, Operationen — sagen Sie 'keine' wenn nicht.",
    fr: "Avez-vous des antécédents médicaux pertinents ? Maladies passées, opérations — dites 'aucun' si non.",
    es: "¿Tiene algún historial médico relevante? Condiciones pasadas, cirugías — diga 'ninguno' si no.",
    ar: "هل لديك تاريخ طبي ذو صلة؟ حالات سابقة، عمليات — قل 'لا شيء' إذا لم يكن.",
    hi: "कोई प्रासंगिक चिकित्सा इतिहास? पिछली बीमारियाँ, सर्जरी — अगर नहीं है तो 'कोई नहीं' कहें।",
  },

  medications: {
    en: "Are you on any regular medications?",
    mi: "E kai ana koe i ētahi rongoā?",
    zh: "您有定期服药吗？",
    ja: "定期的に服用している薬はありますか？",
    ko: "정기적으로 복용하는 약이 있습니까?",
    de: "Nehmen Sie regelmäßig Medikamente?",
    fr: "Prenez-vous des médicaments régulièrement ?",
    es: "¿Toma algún medicamento regularmente?",
    ar: "هل تتناول أدوية منتظمة؟",
    hi: "क्या आप कोई नियमित दवाएं ले रहे हैं?",
  },

  allergies: {
    en: "Any allergies — medications, foods, anything?",
    mi: "He mate huka/hukarere ōu? He rongoā, kai, aha rānei?",
    zh: "有过敏症吗——药物、食物或其他任何东西？",
    ja: "アレルギーはありますか？薬、食べ物、その他何でも。",
    ko: "알레르기가 있습니까? 약물, 음식, 그 외 무엇이든요.",
    de: "Haben Sie Allergien — Medikamente, Lebensmittel, irgendetwas?",
    fr: "Avez-vous des allergies — médicaments, aliments, quoi que ce soit ?",
    es: "¿Tiene alguna alergia — medicamentos, alimentos, lo que sea?",
    ar: "هل لديك حساسية — أدوية، أطعمة، أي شيء؟",
    hi: "कोई एलर्जी है — दवाएं, खाना, कुछ भी?",
  },

  acc_description: {
    en: "That sounds like it could be an ACC claim — can you describe exactly how it happened? What were you doing and where?",
    zh: "这听起来可能是ACC索赔——您能描述一下具体是如何发生的吗？您当时在做什么，在哪里？",
    ja: "ACCの請求になる可能性がありますね。どのように起きたか詳しく教えてください。何をしていて、どこにいましたか？",
    ko: "ACC 청구가 될 수 있을 것 같습니다 — 어떻게 일어났는지 정확히 설명해 주시겠습니까? 무엇을 하고 있었고 어디에 있었습니까?",
    de: "Das könnte ein ACC-Anspruch sein — können Sie genau beschreiben, wie es passiert ist? Was haben Sie gemacht und wo?",
    fr: "Cela pourrait être une demande ACC — pouvez-vous décrire exactement comment c'est arrivé ? Que faisiez-vous et où ?",
    es: "Eso podría ser una reclamación de ACC — ¿puede describir exactamente cómo ocurrió? ¿Qué estaba haciendo y dónde?",
    ar: "يبدو أن هذا يمكن أن يكون مطالبة ACC — هل يمكنك وصف كيف حدث بالضبط؟ ماذا كنت تفعل وأين؟",
    hi: "यह एक ACC दावा हो सकता है — क्या आप बिल्कुल बता सकते हैं कि यह कैसे हुआ? आप क्या कर रहे थे और कहाँ थे?",
  },
  acc_description_error: {
    en: "Can you describe how it happened?",
    zh: "您能描述一下是怎么发生的吗？",
    ja: "どのように起きたか教えてください。",
    ko: "어떻게 일어났는지 설명해 주시겠습니까?",
    de: "Können Sie beschreiben, wie es passiert ist?",
    fr: "Pouvez-vous décrire comment c'est arrivé ?",
    es: "¿Puede describir cómo ocurrió?",
    ar: "هل يمكنك وصف كيف حدث ذلك؟",
    hi: "क्या आप बता सकते हैं कि यह कैसे हुआ?",
  },

  acc_date: {
    en: "When did it happen? (e.g. today, yesterday, 3 days ago)",
    zh: "这是什么时候发生的？（例如：今天、昨天、3天前）",
    ja: "いつ起きましたか？（例：今日、昨日、3日前）",
    ko: "언제 일어났습니까? (예: 오늘, 어제, 3일 전)",
    de: "Wann ist es passiert? (z.B. heute, gestern, vor 3 Tagen)",
    fr: "Quand est-ce arrivé ? (ex. aujourd'hui, hier, il y a 3 jours)",
    es: "¿Cuándo ocurrió? (ej. hoy, ayer, hace 3 días)",
    ar: "متى حدث ذلك؟ (مثلاً: اليوم، أمس، منذ 3 أيام)",
    hi: "यह कब हुआ? (जैसे: आज, कल, 3 दिन पहले)",
  },

  acc_employer: {
    en: "Who's your employer?",
    zh: "您的雇主是谁？",
    ja: "雇用主はどなたですか？",
    ko: "고용주가 누구입니까?",
    de: "Wer ist Ihr Arbeitgeber?",
    fr: "Qui est votre employeur ?",
    es: "¿Quién es su empleador?",
    ar: "من هو صاحب العمل الخاص بك؟",
    hi: "आपके नियोक्ता कौन हैं?",
  },

  photo: {
    en: "Can you take a photo of the affected area? Tap the camera icon — it really helps the doctor. Or type skip.",
    zh: "您能拍一张患处的照片吗？点击相机图标——对医生很有帮助。或者输入「跳过」。",
    ja: "患部の写真を撮ってもらえますか？カメラアイコンをタップしてください — 医師の診断にとても役立ちます。スキップと入力してもOKです。",
    ko: "영향을 받은 부위의 사진을 찍어 주시겠습니까? 카메라 아이콘을 탭하세요 — 의사에게 매우 도움이 됩니다. 또는 '건너뛰기'를 입력하세요.",
    de: "Können Sie ein Foto des betroffenen Bereichs machen? Tippen Sie auf das Kamerasymbol — das hilft dem Arzt wirklich. Oder geben Sie 'weiter' ein.",
    fr: "Pouvez-vous prendre une photo de la zone touchée ? Appuyez sur l'icône de la caméra — ça aide vraiment le médecin. Ou tapez 'ignorer'.",
    es: "¿Puede tomar una foto del área afectada? Toque el ícono de la cámara — realmente ayuda al médico. O escriba 'omitir'.",
    ar: "هل يمكنك التقاط صورة للمنطقة المصابة؟ اضغط على أيقونة الكاميرا — إنها تساعد الطبيب كثيراً. أو اكتب 'تخطي'.",
    hi: "क्या आप प्रभावित क्षेत्र की फोटो ले सकते हैं? कैमरा आइकन दबाएं — यह डॉक्टर को वास्तव में मदद करता है। या 'छोड़ें' टाइप करें।",
  },

  recording: {
    en: "One more thing — do you consent to your consultation being AI-transcribed? The recording is deleted straight after.",
    zh: "最后一个问题——您是否同意对您的会诊进行AI转录？录音会在之后立即删除。",
    ja: "最後です — 診察のAI文字起こしに同意しますか？録音はすぐに削除されます。",
    ko: "마지막으로 — 상담을 AI로 녹취하는 것에 동의하십니까? 녹음은 바로 삭제됩니다.",
    de: "Letzte Frage — stimmen Sie der KI-Transkription Ihrer Konsultation zu? Die Aufnahme wird danach sofort gelöscht.",
    fr: "Dernière question — consentez-vous à la transcription par IA de votre consultation ? L'enregistrement est supprimé juste après.",
    es: "Última pregunta — ¿consiente que su consulta sea transcrita por IA? La grabación se elimina inmediatamente después.",
    ar: "السؤال الأخير — هل توافق على نسخ استشارتك بالذكاء الاصطناعي؟ يُحذف التسجيل مباشرة بعد ذلك.",
    hi: "अंतिम प्रश्न — क्या आप अपनी परामर्श को AI द्वारा ट्रांसक्राइब करने की सहमति देते हैं? रिकॉर्डिंग तुरंत बाद हटा दी जाती है।",
  },

  // ── Triage flow messages ──────────────────────────────────────────────────
  sweet_as: {
    en: "Sweet as! I've got everything I need — setting you up now...",
    zh: "太好了！我已经获得了所需的一切——正在为您设置……",
    ja: "完璧です！必要なものがすべて揃いました — 今すぐ設定します...",
    ko: "완벽합니다! 필요한 모든 것을 갖췄습니다 — 지금 설정 중입니다...",
    de: "Super! Ich habe alles, was ich brauche — richte Sie jetzt ein...",
    fr: "Parfait ! J'ai tout ce qu'il me faut — je vous configure maintenant...",
    es: "¡Perfecto! Tengo todo lo que necesito — configurándolo ahora...",
    ar: "ممتاز! لدي كل ما أحتاجه — إعداد حسابك الآن...",
    hi: "बहुत अच्छा! मुझे सब कुछ मिल गया — अभी आपको सेट अप कर रहा हूँ...",
  },
  welcome_back: {
    en: "Welcome back, ${firstName}! I've got your details — let's get you sorted.",
    zh: "欢迎回来，${firstName}！我已经有您的信息了——让我们来解决您的问题。",
    ja: "おかえりなさい、${firstName}さん！詳細を確認しました — すぐに対応します。",
    ko: "다시 오셨군요, ${firstName}님! 정보를 확인했습니다 — 바로 도와드리겠습니다.",
    de: "Willkommen zurück, ${firstName}! Ich habe Ihre Daten — lassen Sie uns das klären.",
    fr: "Bon retour, ${firstName} ! J'ai vos informations — réglons ça.",
    es: "¡Bienvenido de nuevo, ${firstName}! Tengo sus datos — vamos a solucionarlo.",
    ar: "مرحباً بعودتك، ${firstName}! لدي تفاصيلك — لنحل هذا.",
    hi: "वापस स्वागत है, ${firstName}! मुझे आपकी जानकारी मिल गई — चलिए इसे ठीक करते हैं।",
  },
  cheers_photo: {
    en: "Cheers! The doctor will be able to see those.",
    zh: "谢谢！医生将能看到这些照片。",
    ja: "ありがとうございます！医師が確認できます。",
    ko: "감사합니다! 의사가 확인할 수 있습니다.",
    de: "Danke! Der Arzt wird das sehen können.",
    fr: "Merci ! Le médecin pourra les voir.",
    es: "¡Gracias! El médico podrá verlas.",
    ar: "شكراً! سيتمكن الطبيب من رؤيتها.",
    hi: "धन्यवाद! डॉक्टर उन्हें देख पाएंगे।",
  },
  clinic_closed_suffix: {
    en: " Just so you know, our doctor isn't available right now — but go ahead and fill in your details and we'll hold your spot at the front of the queue. You'll get an email as soon as they're available.",
    zh: " 请注意，我们的医生目前不可用——请继续填写您的信息，我们将为您保留排队前位。医生一旦有空，您将收到电子邮件通知。",
    ja: " なお、現在担当医が対応できない状況ですが、詳細を入力していただければ順番待ちリストの先頭にお名前を確保します。担当医が対応可能になり次第、メールでお知らせします。",
    ko: " 참고로, 현재 의사가 없습니다 — 하지만 정보를 입력하시면 대기열 앞자리를 보장해 드립니다. 의사가 가능해지는 즉시 이메일로 알려드리겠습니다.",
    de: " Zu Ihrer Information: Unser Arzt ist gerade nicht verfügbar — füllen Sie einfach Ihre Daten aus, und wir halten Ihnen einen Platz am Anfang der Warteschlange frei. Sie erhalten eine E-Mail, sobald er verfügbar ist.",
    fr: " Pour information, notre médecin n'est pas disponible en ce moment — remplissez vos informations et nous vous réserverons une place en tête de file. Vous recevrez un e-mail dès qu'il sera disponible.",
    es: " Para su información, nuestro médico no está disponible ahora mismo — continúe con sus datos y le guardaremos el lugar al frente de la cola. Recibirá un correo electrónico en cuanto esté disponible.",
    ar: " فقط لمعلوماتك، طبيبنا غير متاح الآن — لكن استمر في إدخال تفاصيلك وسنحتفظ بمكانك في مقدمة الطابور. ستتلقى بريداً إلكترونياً بمجرد توفره.",
    hi: " बस आपको बता दें, हमारे डॉक्टर अभी उपलब्ध नहीं हैं — लेकिन आगे बढ़ें और अपनी जानकारी भरें, हम कतार में आपकी जगह आरक्षित करेंगे। जैसे ही वे उपलब्ध होंगे, आपको ईमेल मिलेगा।",
  },
  generic_error: {
    en: "Can you try that again?",
    zh: "您能再试一次吗？",
    ja: "もう一度お試しください。",
    ko: "다시 시도해 주세요.",
    de: "Können Sie das nochmals versuchen?",
    fr: "Pouvez-vous réessayer ?",
    es: "¿Puede intentarlo de nuevo?",
    ar: "هل يمكنك المحاولة مرة أخرى؟",
    hi: "क्या आप फिर से कोशिश कर सकते हैं?",
  },

  // ── Yes/No buttons ────────────────────────────────────────────────────────
  yes_label: {
    en: 'Yes', zh: '是', ja: 'はい', ko: '예',
    de: 'Ja', fr: 'Oui', es: 'Sí', ar: 'نعم', hi: 'हाँ',
  },
  no_label: {
    en: 'No', zh: '否', ja: 'いいえ', ko: '아니요',
    de: 'Nein', fr: 'Non', es: 'No', ar: 'لا', hi: 'नहीं',
  },

  // ── Emergency screens ─────────────────────────────────────────────────────
  physical_heading: {
    en: 'Call 111 Now',
    mi: 'Waea atu ki te 111 ināianei',
    zh: '立即拨打111',
    ja: '今すぐ111に電話',
    ko: '지금 111에 전화',
    de: 'Jetzt 111 anrufen',
    fr: 'Appelez le 111 maintenant',
    es: 'Llame al 111 ahora',
    ar: 'اتصل بـ 111 الآن',
    hi: 'अभी 111 पर कॉल करें',
  },
  physical_body: {
    en: 'Your symptoms need immediate emergency care. Please call 111 right now.',
    zh: '您的症状需要立即急救护理。请立即拨打111。',
    ja: 'あなたの症状は緊急医療処置が必要です。今すぐ111に電話してください。',
    ko: '귀하의 증상에는 즉각적인 응급 치료가 필요합니다. 지금 바로 111에 전화하세요.',
    de: 'Ihre Symptome erfordern sofortige Notfallversorgung. Bitte rufen Sie jetzt 111 an.',
    fr: 'Vos symptômes nécessitent des soins d\'urgence immédiats. Veuillez appeler le 111 maintenant.',
    es: 'Sus síntomas requieren atención de emergencia inmediata. Por favor llame al 111 ahora.',
    ar: 'أعراضك تحتاج إلى رعاية طارئة فورية. يرجى الاتصال بـ 111 الآن.',
    hi: 'आपके लक्षणों को तत्काल आपातकालीन देखभाल की आवश्यकता है। कृपया अभी 111 पर कॉल करें।',
  },
  physical_back: {
    en: 'This was a mistake — go back',
    zh: '这是个错误——返回',
    ja: '間違えました — 戻る',
    ko: '잘못 입력했습니다 — 돌아가기',
    de: 'Das war ein Fehler — zurück',
    fr: 'C\'était une erreur — retour',
    es: 'Fue un error — volver',
    ar: 'كان هذا خطأ — رجوع',
    hi: 'यह गलती थी — वापस जाएं',
  },
  mental_heading: {
    en: "You don't have to face this alone",
    zh: '您不必独自面对这一切',
    ja: '一人で抱え込まないでください',
    ko: '혼자 감당하지 않아도 됩니다',
    de: 'Sie müssen das nicht alleine bewältigen',
    fr: 'Vous n\'avez pas à faire face à cela seul',
    es: 'No tiene que enfrentar esto solo',
    ar: 'لست وحدك في مواجهة هذا',
    hi: 'आपको यह अकेले सहन नहीं करना है',
  },
  mental_body: {
    en: "What you're feeling matters. Please reach out to someone who can really help right now.",
    zh: '您的感受很重要。请立即联系能真正帮助您的人。',
    ja: 'あなたの気持ちは大切です。今すぐ本当に助けてくれる人に連絡してください。',
    ko: '당신이 느끼는 것이 중요합니다. 지금 당장 정말로 도움을 줄 수 있는 사람에게 연락하세요.',
    de: 'Was Sie fühlen, ist wichtig. Bitte wenden Sie sich jetzt an jemanden, der wirklich helfen kann.',
    fr: 'Ce que vous ressentez a de l\'importance. Contactez quelqu\'un qui peut vraiment vous aider maintenant.',
    es: 'Lo que sientes importa. Por favor comunícate con alguien que pueda ayudarte de verdad ahora.',
    ar: 'ما تشعر به مهم. يرجى التواصل مع شخص يمكنه مساعدتك حقاً الآن.',
    hi: 'आप जो महसूस कर रहे हैं वह महत्वपूर्ण है। कृपया अभी किसी से संपर्क करें जो वास्तव में मदद कर सके।',
  },
  emergency_danger: {
    en: 'If you are in immediate danger, call 111',
    mi: 'Mēnā kei roto koe i te tino kino, waea atu ki te 111',
    zh: '如果您面临立即危险，请拨打111',
    ja: 'すぐに危険な状況にある場合は111に電話してください',
    ko: '즉각적인 위험에 처해 있다면 111에 전화하세요',
    de: 'Wenn Sie in unmittelbarer Gefahr sind, rufen Sie 111 an',
    fr: 'Si vous êtes en danger immédiat, appelez le 111',
    es: 'Si está en peligro inmediato, llame al 111',
    ar: 'إذا كنت في خطر فوري، اتصل بـ 111',
    hi: 'अगर आप तत्काल खतरे में हैं, तो 111 पर कॉल करें',
  },
  addiction_heading: {
    en: 'Help is available',
    zh: '帮助就在眼前',
    ja: 'サポートを受けられます',
    ko: '도움을 받을 수 있습니다',
    de: 'Hilfe ist verfügbar',
    fr: 'De l\'aide est disponible',
    es: 'Hay ayuda disponible',
    ar: 'المساعدة متاحة',
    hi: 'मदद उपलब्ध है',
  },
  addiction_body: {
    en: 'Reaching out takes courage. These services are free, confidential, and ready to help.',
    zh: '寻求帮助需要勇气。这些服务免费、保密，随时准备好帮助您。',
    ja: '助けを求めることには勇気が必要です。これらのサービスは無料で、秘密が守られ、いつでもサポートします。',
    ko: '도움을 요청하는 것은 용기가 필요합니다. 이 서비스들은 무료이고 비밀이 보장되며 도움을 줄 준비가 되어 있습니다.',
    de: 'Sich Hilfe zu holen braucht Mut. Diese Dienste sind kostenlos, vertraulich und bereit zu helfen.',
    fr: 'Demander de l\'aide demande du courage. Ces services sont gratuits, confidentiels et prêts à vous aider.',
    es: 'Pedir ayuda requiere valentía. Estos servicios son gratuitos, confidenciales y listos para ayudar.',
    ar: 'يتطلب طلب المساعدة شجاعة. هذه الخدمات مجانية وسرية وجاهزة للمساعدة.',
    hi: 'मदद माँगने के लिए साहस चाहिए। ये सेवाएं मुफ्त, गोपनीय और मदद के लिए तैयार हैं।',
  },

  // ── Chat / translation ────────────────────────────────────────────────────
  translation_disclaimer: {
    en: 'Translations are provided as assistance only. For complex medical discussions, a professional interpreter is recommended.',
    zh: '翻译仅作参考。对于复杂的医疗讨论，建议使用专业口译员。',
    ja: '翻訳はサポートとして提供されています。複雑な医療相談には専門の通訳者をお勧めします。',
    ko: '번역은 보조 용도로만 제공됩니다. 복잡한 의료 상담의 경우 전문 통역사가 권장됩니다.',
    de: 'Übersetzungen dienen nur als Unterstützung. Für komplexe medizinische Gespräche wird ein professioneller Dolmetscher empfohlen.',
    fr: 'Les traductions sont fournies à titre d\'aide seulement. Pour les discussions médicales complexes, un interprète professionnel est recommandé.',
    es: 'Las traducciones se proporcionan solo como asistencia. Para discusiones médicas complejas, se recomienda un intérprete profesional.',
    ar: 'تُقدَّم الترجمات كمساعدة فقط. للمناقشات الطبية المعقدة، يُوصى بمترجم متخصص.',
    hi: 'अनुवाद केवल सहायता के रूप में प्रदान किए जाते हैं। जटिल चिकित्सा चर्चाओं के लिए एक पेशेवर दुभाषिया अनुशंसित है।',
  },
  show_original: {
    en: 'Show original', zh: '显示原文', ja: '原文を表示', ko: '원문 보기',
    de: 'Original anzeigen', fr: 'Voir l\'original', es: 'Ver original', ar: 'عرض الأصل', hi: 'मूल दिखाएं',
  },
  hide_original: {
    en: 'Hide', zh: '隐藏', ja: '非表示', ko: '숨기기',
    de: 'Ausblenden', fr: 'Masquer', es: 'Ocultar', ar: 'إخفاء', hi: 'छुपाएं',
  },
  translating: {
    en: 'Translating…', zh: '翻译中…', ja: '翻訳中…', ko: '번역 중…',
    de: 'Übersetzen…', fr: 'Traduction…', es: 'Traduciendo…', ar: 'جارٍ الترجمة…', hi: 'अनुवाद हो रहा है…',
  },
  chat_label: {
    en: 'Chat', zh: '聊天', ja: 'チャット', ko: '채팅',
    de: 'Chat', fr: 'Chat', es: 'Chat', ar: 'دردشة', hi: 'चैट',
  },

  // ── TereIntro ─────────────────────────────────────────────────────────────
  choose_language: {
    en: 'Choose your language', zh: '选择语言', ja: '言語を選択', ko: '언어 선택',
    de: 'Sprache wählen', fr: 'Choisir la langue', es: 'Elige tu idioma', ar: 'اختر لغتك', hi: 'अपनी भाषा चुनें',
  },
  get_started: {
    en: 'Get started →', zh: '开始 →', ja: '始める →', ko: '시작하기 →',
    de: 'Loslegen →', fr: 'Commencer →', es: 'Comenzar →', ar: 'ابدأ ←', hi: 'शुरू करें →',
  },
  step_1: {
    en: 'Quick chat', zh: '快速问诊', ja: 'クイック問診', ko: '빠른 상담',
    de: 'Kurzes Gespräch', fr: 'Chat rapide', es: 'Chat rápido', ar: 'دردشة سريعة', hi: 'त्वरित चैट',
  },
  step_2: {
    en: 'Vitals scan', zh: '体征扫描', ja: 'バイタル測定', ko: '활력징후 측정',
    de: 'Vitalwerte', fr: 'Bilan santé', es: 'Signos vitales', ar: 'قياس الحيوية', hi: 'वाइटल स्कैन',
  },
  step_3: {
    en: 'See doctor', zh: '看医生', ja: '医師に診てもらう', ko: '의사 진찰',
    de: 'Arzt sehen', fr: 'Voir le médecin', es: 'Ver al médico', ar: 'رؤية الطبيب', hi: 'डॉक्टर से मिलें',
  },
  step_4: {
    en: 'Get sorted', zh: '获得诊治', ja: '治療を受ける', ko: '해결하기',
    de: 'Behandlung', fr: 'Être soigné', es: 'Resolver', ar: 'الحصول على الحل', hi: 'समाधान पाएं',
  },

  // ── Prescribing limitations gate ─────────────────────────────────────────
  prescribing_gate_intro: {
    en: 'Before we begin',
    zh: '开始之前',
    ja: '始める前に',
    ko: '시작하기 전에',
    de: 'Bevor wir beginnen',
    fr: 'Avant de commencer',
    es: 'Antes de comenzar',
    ar: 'قبل أن نبدأ',
    hi: 'शुरू करने से पहले',
  },
  prescribing_gate_title: {
    en: 'What Tere Health can and cannot prescribe',
    zh: 'Tere Health 能开和不能开的处方',
    ja: 'Tere Health が処方できるものとできないもの',
    ko: 'Tere Health가 처방할 수 있는 것과 없는 것',
    de: 'Was Tere Health verschreiben kann und was nicht',
    fr: 'Ce que Tere Health peut et ne peut pas prescrire',
    es: 'Lo que Tere Health puede y no puede recetar',
    ar: 'ما يمكن وما لا يمكن لـ Tere Health وصفه',
    hi: 'Tere Health क्या लिख सकता है और क्या नहीं',
  },
  prescribing_gate_body: {
    en: 'Tere Health doctors can prescribe many common medications via telehealth. However, New Zealand law places restrictions on certain controlled drugs and medications requiring specialist oversight. Please read and acknowledge the following before continuing.',
    zh: 'Tere Health 的医生可以通过远程医疗开具许多常见药物。但是，新西兰法律对某些受管制药物和需要专科监督的药物有限制。请在继续之前阅读并确认以下内容。',
    ja: 'Tere Healthの医師はテレヘルスを通じて多くの一般的な薬を処方できます。ただし、ニュージーランドの法律により、一部の規制薬物および専門家の監督を必要とする薬物には制限があります。続ける前に以下をお読みになり、確認してください。',
    ko: 'Tere Health 의사들은 원격 진료를 통해 많은 일반 의약품을 처방할 수 있습니다. 그러나 뉴질랜드 법률은 특정 규제 약물 및 전문가 감독이 필요한 약물에 제한을 두고 있습니다. 계속하기 전에 다음 내용을 읽고 확인해 주세요.',
    de: 'Tere-Health-Ärzte können viele gängige Medikamente über Telemedizin verschreiben. Das neuseeländische Recht setzt jedoch bestimmten Betäubungsmitteln und Medikamenten, die eine fachärztliche Überwachung erfordern, Grenzen. Bitte lesen und bestätigen Sie Folgendes, bevor Sie fortfahren.',
    fr: 'Les médecins de Tere Health peuvent prescrire de nombreux médicaments courants via la télémédecine. Cependant, la loi néo-zélandaise impose des restrictions sur certains médicaments contrôlés et ceux nécessitant une surveillance spécialisée. Veuillez lire et accepter ce qui suit avant de continuer.',
    es: 'Los médicos de Tere Health pueden recetar muchos medicamentos comunes mediante telemedicina. Sin embargo, la ley de Nueva Zelanda impone restricciones sobre ciertos medicamentos controlados y los que requieren supervisión especializada. Por favor lea y confirme lo siguiente antes de continuar.',
    ar: 'يمكن لأطباء Tere Health وصف كثير من الأدوية الشائعة عبر الرعاية الصحية عن بُعد. غير أن القانون النيوزيلندي يفرض قيوداً على بعض الأدوية الخاضعة للرقابة والأدوية التي تستلزم إشراف أخصائي. يرجى قراءة ما يلي والإقرار به قبل المتابعة.',
    hi: 'Tere Health के डॉक्टर टेलीहेल्थ के माध्यम से कई सामान्य दवाएं लिख सकते हैं। हालांकि, न्यूज़ीलैंड कानून कुछ नियंत्रित दवाओं और विशेषज्ञ निगरानी की आवश्यकता वाली दवाओं पर प्रतिबंध लगाता है। कृपया जारी रखने से पहले निम्नलिखित पढ़ें और स्वीकार करें।',
  },
  prescribing_gate_checkbox: {
    en: 'I understand that Tere Health cannot prescribe controlled drugs (opioids, benzodiazepines, stimulants) or GLP-1 weight loss injections (Ozempic/Wegovy) via telehealth, and I will see my GP or a specialist for these.',
    zh: '我理解 Tere Health 不能通过远程医疗开具管制药物（阿片类药物、苯二氮䓬类药物、兴奋剂）或 GLP-1 减重注射剂（Ozempic/Wegovy），如需这些药物，我将去看全科医生或专科医生。',
    ja: 'Tere Healthはテレヘルスを通じて規制薬物（オピオイド、ベンゾジアゼピン、覚醒剤）やGLP-1体重減少注射（Ozempic/Wegovy）を処方できないことを理解しており、これらが必要な場合はかかりつけ医または専門医を受診します。',
    ko: 'Tere Health는 원격 진료를 통해 규제 약물(오피오이드, 벤조디아제핀, 자극제) 또는 GLP-1 체중 감량 주사(Ozempic/Wegovy)를 처방할 수 없으며, 이러한 약물이 필요한 경우 GP나 전문의를 방문하겠음을 이해합니다.',
    de: 'Ich verstehe, dass Tere Health über Telemedizin keine Betäubungsmittel (Opioide, Benzodiazepine, Stimulanzien) oder GLP-1-Gewichtsabnahmespritzen (Ozempic/Wegovy) verschreiben kann und ich für diese Medikamente meinen Hausarzt oder einen Spezialisten aufsuchen werde.',
    fr: 'Je comprends que Tere Health ne peut pas prescrire de médicaments contrôlés (opioïdes, benzodiazépines, stimulants) ou d\'injections amaigrissantes GLP-1 (Ozempic/Wegovy) via la télémédecine, et que je devrai consulter mon médecin généraliste ou un spécialiste pour ces médicaments.',
    es: 'Entiendo que Tere Health no puede recetar medicamentos controlados (opioides, benzodiacepinas, estimulantes) ni inyecciones para pérdida de peso GLP-1 (Ozempic/Wegovy) mediante telemedicina, y que visitaré a mi médico de cabecera o especialista para estos.',
    ar: 'أفهم أن Tere Health لا يمكنه وصف الأدوية الخاضعة للرقابة (المواد الأفيونية، البنزوديازيبينات، المنشطات) أو حقن إنقاص الوزن GLP-1 (أوزيمبيك/ويغوفي) عبر الرعاية عن بُعد، وسأتوجه إلى طبيبي العام أو أخصائي للحصول عليها.',
    hi: 'मैं समझता/समझती हूं कि Tere Health टेलीहेल्थ के माध्यम से नियंत्रित दवाएं (ओपिओइड, बेंजोडायजेपाइन, उत्तेजक) या GLP-1 वजन घटाने के इंजेक्शन (Ozempic/Wegovy) नहीं लिख सकता, और इनके लिए मैं अपने GP या विशेषज्ञ से मिलूंगा/मिलूंगी।',
  },
  prescribing_gate_button: {
    en: 'I understand — continue',
    zh: '我理解——继续',
    ja: '理解しました——続ける',
    ko: '이해했습니다 — 계속',
    de: 'Ich verstehe — weiter',
    fr: 'Je comprends — continuer',
    es: 'Entiendo — continuar',
    ar: 'أفهم — متابعة',
    hi: 'मैं समझता/समझती हूं — जारी रखें',
  },
  controlled_med_notice: {
    en: "I've noted that. Just so you know — controlled medications (such as opioids, benzodiazepines, or GLP-1 injections like Ozempic) cannot be prescribed via telehealth. Your doctor will discuss what options are available for you today.",
    zh: '我注意到了。请您知悉——管制药物（如阿片类药物、苯二氮䓬类药物或 Ozempic 等 GLP-1 注射剂）无法通过远程医疗开具处方。您的医生将与您讨论今天可用的选择。',
    ja: '承知しました。ご参考までに——オピオイド、ベンゾジアゼピン、OzempicなどのGLP-1注射といった規制薬物はテレヘルスでは処方できません。本日どのような選択肢があるかについて、担当医が説明します。',
    ko: '알겠습니다. 참고로 — 오피오이드, 벤조디아제핀, Ozempic과 같은 GLP-1 주사 등 규제 약물은 원격 진료를 통해 처방받을 수 없습니다. 의사가 오늘 이용 가능한 옵션에 대해 논의해 드릴 것입니다.',
    de: 'Ich habe das zur Kenntnis genommen. Nur zur Information — kontrollierte Medikamente (wie Opioide, Benzodiazepine oder GLP-1-Spritzen wie Ozempic) können nicht über Telemedizin verschrieben werden. Ihr Arzt wird mit Ihnen besprechen, welche Optionen heute für Sie verfügbar sind.',
    fr: 'J\'en ai pris note. Pour information — les médicaments contrôlés (comme les opioïdes, les benzodiazépines ou les injections GLP-1 telles qu\'Ozempic) ne peuvent pas être prescrits via la télémédecine. Votre médecin discutera des options disponibles pour vous aujourd\'hui.',
    es: 'Lo he anotado. Para que lo sepa — los medicamentos controlados (como opioides, benzodiacepinas o inyecciones GLP-1 como Ozempic) no pueden recetarse mediante telemedicina. Su médico discutirá qué opciones están disponibles para usted hoy.',
    ar: 'لقد لاحظت ذلك. فقط لمعلوماتك — لا يمكن وصف الأدوية الخاضعة للرقابة (مثل المواد الأفيونية، البنزوديازيبينات، أو حقن GLP-1 مثل أوزيمبيك) عبر الرعاية عن بُعد. سيناقش طبيبك الخيارات المتاحة لك اليوم.',
    hi: 'मैंने यह नोट कर लिया है। बस जानकारी के लिए — नियंत्रित दवाएं (जैसे ओपिओइड, बेंजोडायजेपाइन, या Ozempic जैसे GLP-1 इंजेक्शन) टेलीहेल्थ के माध्यम से नहीं लिखी जा सकतीं। आपके डॉक्टर आज आपके लिए उपलब्ध विकल्पों पर चर्चा करेंगे।',
  },

  // ── Symptom follow-ups (added for Te Reo bring-up 2026-07-04) ─────────────
  symptom_duration:  { en: 'How long have you had this problem?', mi: 'Nō nāhea tēnei raruraru?' },
  symptom_onset:     { en: 'When did this start?',                 mi: 'Nō nāhea tēnei i tīmata ai?' },
  symptom_pain:      { en: 'How severe is your pain? (1-10)',       mi: 'E hia te kaha o tō mamae? (1-10)' },
  symptom_chest:     { en: 'Do you have chest pain?',               mi: 'He mamae ō uma?' },
  symptom_breathing: { en: 'Are you having trouble breathing?',     mi: 'He uaua tō manawa?' },
  symptom_dizzy:     { en: 'Do you feel dizzy?',                    mi: 'He amuamu tō mātenga?' },
  symptom_vomit:     { en: 'Have you vomited?',                     mi: 'Kua ruaki koe?' },
  symptom_fever:     { en: 'Do you have a fever?',                  mi: 'He kōhukihuki ōu?' },

  // ── Provider status ──────────────────────────────────────────────────────
  provider_shortly:  { en: 'Your provider will be with you shortly', mi: 'Ka tae atu tō rata āpōpō tata' },

  // ── Buttons ──────────────────────────────────────────────────────────────
  btn_continue: { en: 'Continue', mi: 'Haere tonu' },
  btn_back:     { en: 'Back',     mi: 'Hoki' },
  btn_skip:     { en: 'Skip',     mi: 'Tukua' },
  btn_submit:   { en: 'Submit',   mi: 'Tukua atu' },

  // ── Bilingual red flag: shows Te Reo + English regardless of chosen language ─
  // Rendered by t_bilingual() helper so critical warnings never appear in Te Reo only.
  red_flag_call_111: { en: 'Call 111 immediately', mi: 'Waea atu ki te 111 ināianei' },
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
