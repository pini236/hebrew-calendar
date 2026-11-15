/**
 * The texts of the lighting, as in the common siddurim (nusach Ashkenaz / Sefarad). The blessings are said
 * before lighting; הנרות הללו after the first light; מעוז צור after the lighting. The Name is written ה׳.
 */

export const BLESSINGS: { he: string; en: string; firstNight?: boolean }[] = [
  {
    he: 'בָּרוּךְ אַתָּה ה׳ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ לְהַדְלִיק נֵר חֲנֻכָּה.',
    en: 'Blessed are You, Lord our God, King of the universe, who has sanctified us with His commandments and commanded us to kindle the Chanukah light.',
  },
  {
    he: 'בָּרוּךְ אַתָּה ה׳ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁעָשָׂה נִסִּים לַאֲבוֹתֵינוּ בַּיָּמִים הָהֵם בַּזְּמַן הַזֶּה.',
    en: 'Blessed are You, Lord our God, King of the universe, who performed miracles for our ancestors in those days, at this season.',
  },
  {
    he: 'בָּרוּךְ אַתָּה ה׳ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, שֶׁהֶחֱיָנוּ וְקִיְּמָנוּ וְהִגִּיעָנוּ לַזְּמַן הַזֶּה.',
    en: 'Blessed are You, Lord our God, King of the universe, who has given us life, sustained us and brought us to this season.',
    firstNight: true,
  },
];

export const HANEROT_HALALU = {
  he: 'הַנֵּרוֹת הַלָּלוּ אָנוּ מַדְלִיקִין עַל הַנִּסִּים וְעַל הַנִּפְלָאוֹת וְעַל הַתְּשׁוּעוֹת וְעַל הַמִּלְחָמוֹת, שֶׁעָשִׂיתָ לַאֲבוֹתֵינוּ בַּיָּמִים הָהֵם בַּזְּמַן הַזֶּה, עַל יְדֵי כֹּהֲנֶיךָ הַקְּדוֹשִׁים. וְכָל שְׁמוֹנַת יְמֵי חֲנֻכָּה הַנֵּרוֹת הַלָּלוּ קֹדֶשׁ הֵם, וְאֵין לָנוּ רְשׁוּת לְהִשְׁתַּמֵּשׁ בָּהֶם, אֶלָּא לִרְאוֹתָם בִּלְבָד, כְּדֵי לְהוֹדוֹת וּלְהַלֵּל לְשִׁמְךָ הַגָּדוֹל עַל נִסֶּיךָ וְעַל נִפְלְאוֹתֶיךָ וְעַל יְשׁוּעָתֶךָ.',
  en: 'We kindle these lights for the miracles and the wonders, for the salvations and the battles that You performed for our ancestors in those days, at this season, through Your holy priests. Throughout the eight days of Chanukah these lights are holy; we may not make use of them, only look at them, to give thanks and praise to Your great Name for Your miracles, Your wonders and Your salvation.',
};

/** מעוז צור: six stanzas of four lines (many sing the first only) */
export const MAOZ_TZUR: string[][] = [
  ['מָעוֹז צוּר יְשׁוּעָתִי, לְךָ נָאֶה לְשַׁבֵּחַ,', 'תִּכּוֹן בֵּית תְּפִלָּתִי, וְשָׁם תּוֹדָה נְזַבֵּחַ.', 'לְעֵת תָּכִין מַטְבֵּחַ מִצָּר הַמְנַבֵּחַ,', 'אָז אֶגְמֹר בְּשִׁיר מִזְמוֹר חֲנֻכַּת הַמִּזְבֵּחַ.'],
  ['רָעוֹת שָׂבְעָה נַפְשִׁי, בְּיָגוֹן כֹּחִי כָּלָה,', 'חַיַּי מֵרְרוּ בְּקֹשִׁי, בְּשִׁעְבּוּד מַלְכוּת עֶגְלָה.', 'וּבְיָדוֹ הַגְּדוֹלָה הוֹצִיא אֶת הַסְּגֻלָּה,', 'חֵיל פַּרְעֹה וְכָל זַרְעוֹ יָרְדוּ כְּאֶבֶן מְצוּלָה.'],
  ['דְּבִיר קָדְשׁוֹ הֱבִיאַנִי, וְגַם שָׁם לֹא שָׁקַטְתִּי,', 'וּבָא נוֹגֵשׂ וְהִגְלַנִי, כִּי זָרִים עָבַדְתִּי.', 'וְיֵין רַעַל מָסַכְתִּי, כִּמְעַט שֶׁעָבַרְתִּי,', 'קֵץ בָּבֶל זְרֻבָּבֶל, לְקֵץ שִׁבְעִים נוֹשָׁעְתִּי.'],
  ['כְּרֹת קוֹמַת בְּרוֹשׁ בִּקֵּשׁ אֲגָגִי בֶּן הַמְּדָתָא,', 'וְנִהְיָתָה לוֹ לְפַח וּלְמוֹקֵשׁ, וְגַאֲוָתוֹ נִשְׁבָּתָה.', 'רֹאשׁ יְמִינִי נִשֵּׂאתָ, וְאוֹיֵב שְׁמוֹ מָחִיתָ,', 'רֹב בָּנָיו וְקִנְיָנָיו עַל הָעֵץ תָּלִיתָ.'],
  ['יְוָנִים נִקְבְּצוּ עָלַי אֲזַי בִּימֵי חַשְׁמַנִּים,', 'וּפָרְצוּ חוֹמוֹת מִגְדָּלַי, וְטִמְּאוּ כָּל הַשְּׁמָנִים.', 'וּמִנּוֹתַר קַנְקַנִּים נַעֲשָׂה נֵס לַשּׁוֹשַׁנִּים,', 'בְּנֵי בִינָה יְמֵי שְׁמוֹנָה קָבְעוּ שִׁיר וּרְנָנִים.'],
  ['חֲשׂוֹף זְרוֹעַ קָדְשֶׁךָ, וְקָרֵב קֵץ הַיְשׁוּעָה,', 'נְקֹם נִקְמַת דַּם עֲבָדֶיךָ מֵאֻמָּה הָרְשָׁעָה.', 'כִּי אָרְכָה לָנוּ הַשָּׁעָה, וְאֵין קֵץ לִימֵי הָרָעָה,', 'דְּחֵה אַדְמוֹן בְּצֵל צַלְמוֹן, הָקֵם לָנוּ רוֹעִים שִׁבְעָה.'],
];
