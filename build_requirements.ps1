$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '知途课堂需求分析文档.docx'
$work = Join-Path $env:TEMP 'zhitu-docx-build'
if (Test-Path $work) {
    Remove-Item -LiteralPath $work -Recurse -Force 
}
New-Item -ItemType Directory -Path "$work\_rels", "$work\word\_rels" -Force | Out-Null
function X([string]$s) {
    [System.Security.SecurityElement]::Escape($s) 
}
function P([string]$s, [string]$style = 'Body', [bool]$page = $false) {
    $break = if ($page) {
        '<w:br w:type="page"/>'
    } else {
        ''
    }
    "<w:p><w:pPr><w:pStyle w:val=`"$style`"/></w:pPr><w:r>$break<w:t xml:space=`"preserve`">$(X $s)</w:t></w:r></w:p>"
}
function Bul([string]$s) {
    "<w:p><w:pPr><w:ind w:left=`"420`" w:hanging=`"210`"/></w:pPr><w:r><w:t>• $(X $s)</w:t></w:r></w:p>" 
}
function Tbl([object[]]$rows) {
    $xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="single" w:sz="4" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/><w:right w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders></w:tblPr>'
    foreach ($row in $rows) {
        $xml += '<w:tr>'; foreach ($cell in $row) {
            $xml += "<w:tc><w:tcPr><w:tcMar><w:top w:w=`"100`" w:type=`"dxa`"/><w:left w:w=`"120`" w:type=`"dxa`"/><w:bottom w:w=`"100`" w:type=`"dxa`"/><w:right w:w=`"120`" w:type=`"dxa`"/></w:tcMar></w:tcPr><w:p><w:r><w:t xml:space=`"preserve`">$(X $cell)</w:t></w:r></w:p></w:tc>"
        }; $xml += '</w:tr>'
    }; return $xml + '</w:tbl>'
}
$b = @()
$b += P '知途课堂在线网课系统需求分析文档' 'Title'
$b += P '面向考研 考公 计算机与职业技能学习的课程平台' 'Subtitle'
$b += P '本文档定义知途课堂大作业的业务范围、用户与管理员功能、核心用例、数据需求及验收标准。系统以视频课程为主线，支持课程发现、学习进度、直播预约和后台内容管理。' 'Body'
$b += P '1 项目概述' 'H1'
$b += P '知途课堂是一个面向大学生、备考人群及技能提升者的在线学习平台。课程按考研公共课、考公课程、计算机课程和其他课程组织。前台采用类似视频社区的浏览体验，帮助学习者快速发现课程；后台帮助管理员维护课程、章节、教师与学习数据。' 'Body'
$b += P '1.1 建设目标' 'H2'
$b += Bul '为学习者提供清晰的课程分类、搜索、试看和连续学习入口。'
$b += Bul '为课程运营人员提供课程发布、章节维护、直播安排和数据查看能力。'
$b += Bul '通过学习记录与进度展示，帮助用户形成可持续的学习节奏。'
$b += P '1.2 角色定义' 'H2'
$b += Tbl @(@('角色', '主要职责'), @('游客', '浏览首页、搜索课程、查看课程详情与试听内容'), @('注册用户', '选课、观看视频、收藏课程、查看进度、预约直播'), @('课程管理员', '维护课程、章节、教师、分类与直播信息'), @('系统管理员', '管理用户、审核内容、查看统计数据与处理异常'))
$b += P '2 功能范围与总体用例' 'H1' $true
$b += P '系统分为学习者前台和管理后台两类入口。下图以文字用例图表示角色与功能边界，开发时可据此绘制 UML 用例图。' 'Body'
$b += P '图 2 1 用户功能总体用例图' 'Caption'
$b += P '游客或注册用户 → 注册登录、浏览推荐、按分类筛选、搜索课程、查看详情、试听视频；注册用户 → 加入学习、观看课程、记录进度、收藏课程、预约直播、查看个人学习中心。' 'Diagram'
$b += P '图 2 2 管理员功能总体用例图' 'Caption'
$b += P '课程管理员 → 登录后台、管理课程分类、发布或编辑课程、维护章节视频、管理直播；系统管理员 → 管理用户、审核课程、查看学习统计、处理违规或异常内容。' 'Diagram'
$b += P '2.1 前台功能清单' 'H2'
$b += Tbl @(@('模块', '功能说明'), @('首页推荐', '展示轮播、热门课程、课程分类、继续学习和近期直播'), @('课程中心', '按分类筛选课程；支持按课程名、讲师或知识点搜索'), @('课程详情', '展示课程简介、讲师、章节目录、学习人数和试听入口'), @('学习中心', '展示已学课程、观看进度、收藏列表与连续学习天数'), @('直播', '展示直播主题、时间、讲师信息；用户可预约并收到提醒'))
$b += P '3 用户端核心用例规约' 'H1' $true
$b += P '3.1 搜索与筛选课程' 'H2'
$b += P '搜索课程是用户发现学习内容的主要入口。用户输入关键词或选择分类后，系统返回匹配课程，并允许继续进入课程详情。' 'Body'
$b += Tbl @(@('用例名称', '搜索与筛选课程'), @('参与者', '游客、注册用户'), @('前置条件', '用户已进入首页或课程中心'), @('基本流程', '1 用户输入关键词或点击分类；2 系统检索课程标题、讲师和标签；3 系统展示匹配列表；4 用户点击课程卡片查看详情'), @('备选流程', '无匹配内容时，系统提示用户更换关键词或浏览推荐课程'), @('后置条件', '系统保留本次检索条件，用户可继续浏览或学习'))
$b += P '3.2 加入学习与记录进度' 'H2'
$b += P '用户从课程详情进入课程播放页后，可按章节观看视频。系统需要保存最近观看章节与观看比例，使用户下次进入时能够继续学习。' 'Body'
$b += Tbl @(@('用例名称', '加入学习与记录进度'), @('参与者', '注册用户'), @('前置条件', '用户已登录并选择一门可学习课程'), @('基本流程', '1 用户点击立即学习；2 系统创建选课记录；3 用户选择章节播放；4 系统定时保存播放位置和完成比例；5 学习中心更新进度'), @('异常流程', '登录失效时要求重新登录；视频资源不可用时提示稍后重试'), @('后置条件', '课程出现在我的学习列表，章节进度可被恢复'))
$b += P '3.3 预约直播' 'H2'
$b += Tbl @(@('用例名称', '预约直播'), @('参与者', '注册用户'), @('前置条件', '直播已发布且尚未结束'), @('基本流程', '1 用户在直播列表点击预约；2 系统校验登录状态；3 系统保存预约记录；4 页面显示已预约状态'), @('后置条件', '用户可在个人中心查看预约，开播前可发送站内提醒'))
$b += P '4 管理端核心用例规约' 'H1' $true
$b += P '4.1 发布课程' 'H2'
$b += Tbl @(@('用例名称', '发布课程'), @('参与者', '课程管理员'), @('前置条件', '管理员已登录后台，课程分类与讲师资料已存在'), @('基本流程', '1 填写课程名称、分类、简介与封面；2 添加讲师和章节；3 为章节关联视频或试听标记；4 提交审核或直接发布；5 前台课程中心展示课程'), @('业务规则', '课程名称不能为空；至少包含一个章节；仅已审核课程对普通用户可见'), @('后置条件', '生成课程与章节数据，并记录发布操作日志'))
$b += P '4.2 管理用户与内容' 'H2'
$b += Tbl @(@('用例名称', '管理用户与内容'), @('参与者', '系统管理员'), @('前置条件', '管理员具备系统管理权限'), @('基本流程', '查询用户或课程；查看详情；按规则执行启用、停用、下架或恢复；系统记录操作原因与时间'), @('后置条件', '目标对象状态更新，前台按权限控制可见内容'))
$b += P '5 数据需求与非功能需求' 'H1' $true
$b += P '5.1 核心数据实体' 'H2'
$b += Tbl @(@('实体', '关键字段', '关系说明'), @('用户', '用户编号、昵称、账号、密码摘要、角色、状态', '用户可拥有多条选课、收藏和直播预约记录'), @('课程', '课程编号、名称、分类、讲师、简介、封面、状态', '一门课程由多个章节组成'), @('章节', '章节编号、课程编号、标题、视频地址、时长、试听标记', '章节属于一门课程'), @('学习记录', '用户编号、课程编号、章节编号、进度、最近学习时间', '用于恢复学习与统计完成率'), @('直播', '直播编号、主题、讲师、开始时间、状态', '用户可预约多场直播'))
$b += P '5.2 非功能需求' 'H2'
$b += Bul '易用性：桌面端与移动端均可完成浏览、搜索和观看等主要任务。'
$b += Bul '性能：常规网络下，课程列表与详情页面应在 3 秒内完成首屏展示。'
$b += Bul '安全性：密码仅保存不可逆摘要；后台功能依据角色进行权限校验。'
$b += Bul '兼容性：前端兼容近两年主流 Chrome、Edge 与移动端浏览器。'
$b += P '6 验收标准与迭代建议' 'H1'
$b += Tbl @(@('验收项', '通过标准'), @('课程浏览', '可展示四类课程，点击分类后列表正确变化'), @('课程搜索', '输入课程名、讲师或分类关键词可得到对应课程'), @('课程详情', '点击任一课程可查看简介、讲师、目录与试听入口'), @('学习进度', '学习中心可展示继续学习课程及模拟进度'), @('直播预约', '点击预约后按钮状态变为已预约'), @('后台扩展', '数据模型已预留课程、章节、用户、学习记录与直播实体'))
$b += P '本版本定位为大作业的前端原型与需求基线。下一阶段可接入后端 API、对象存储视频服务、真实登录与数据库，以实现完整业务闭环。' 'Body'
$document = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>$($b -join "`n")<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1300" w:bottom="1300" w:left="1300"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>
"@
$styles = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:color w:val="222222"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="110"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Body" w:default="1"><w:name w:val="正文"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="900" w:after="220"/></w:pPr><w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="600"/></w:pPr><w:rPr><w:sz w:val="22"/><w:color w:val="666666"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="300" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="H2"><w:name w:val="Heading 2"/><w:pPr><w:spacing w:before="220" w:after="110"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="100" w:after="60"/></w:pPr><w:rPr><w:i/><w:sz w:val="19"/><w:color w:val="666666"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Diagram"><w:name w:val="Diagram"/><w:pPr><w:spacing w:after="220"/><w:ind w:left="400" w:right="400"/></w:pPr><w:rPr><w:sz w:val="20"/><w:color w:val="333333"/></w:rPr></w:style></w:styles>
"@
$contentTypes = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'
$rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'
$docrels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
New-Item -ItemType Directory -Path "$work\docProps" -Force | Out-Null
[IO.File]::WriteAllText("$work\[Content_Types].xml", $contentTypes, [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\_rels\.rels", $rels, [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\word\document.xml", $document, [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\word\styles.xml", $styles, [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\word\_rels\document.xml.rels", $docrels, [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\docProps\core.xml", '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>知途课堂在线网课系统需求分析文档</dc:title><dc:creator>知途课堂项目组</dc:creator></cp:coreProperties>', [Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText("$work\docProps\app.xml", '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>', [Text.UTF8Encoding]::new($false))
if (Test-Path $out) {
    Remove-Item -LiteralPath $out -Force
}; Compress-Archive -Path "$work\*" -DestinationPath $out -Force
Write-Output $out
