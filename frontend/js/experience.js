import { enhanceSelect } from './select-menu.js';
// UI-only localization: original course content and user input are never translated.
const dictionary = Object.fromEntries(
  `学习记录管理|Learning records
学习记录类型|Record type
打开学习记录管理|Open learning records
弹幕管理|On-screen comments
笔记元信息|Note metadata
历史记录|Visit history
章节收藏|Saved videos
播放进度|Playback progress
昵称或用户编号|Nickname or user ID
用户编号（精确）|Exact user ID
开始日期（北京时间）|Start date (Beijing time)
结束日期（北京时间）|End date (Beijing time)
打卡月份|Check-in month
请选择月份|Choose a month
查询|Search
搜索弹幕内容|Search on-screen comments
历史未绑定章节|Legacy: no chapter assigned
历史未记录作者|Legacy: author not recorded
视频时间点|Video timestamp
当前位置|Saved position
正文保持私有|Note contents remain private
清理记录|Remove record
只读|Read only
确认清理这条记录？此操作不可撤销。|Remove this record? This cannot be undone.
有色日期表示已打卡，不表示观看时长。|Colored dates indicate check-ins, not watch time.
每门课程保留最近一次访问；清理不删除收藏、笔记或播放进度，并停止用旧进度补回历史。|Only the latest visit per course is retained. Removal preserves saved videos, notes and progress, and disables legacy history recovery from progress.
收藏对应章节视频，移除后用户书架同步移除；不删除视频或播放进度。|Saved items refer to individual videos. Removing one updates the user's shelf and preserves the video and playback progress.
按北京时间记录主动打卡。只查询或清理异常记录，不代用户补签。|Check-ins use Beijing time. Review or remove incorrect records; do not create check-ins for users.
仅原生播放器保存进度；不等同于实际观看时长。旧表未记录更新时间，仅供查询。|Only the native player saves progress. It does not measure time spent watching. Update timestamps were not recorded; this view is read only.
仅显示笔记所属章节、时间点和创建时间，不读取或修改私人正文。|View the chapter, timestamp and creation date only. Private note contents are not read or edited.
可查询或移除关注关系。旧表未记录关注时间，不代用户新增关注。|Review or remove follows. Follow timestamps were not recorded. Do not create follows for users.
弹幕对应章节视频；历史作者未记录。支持隐藏、恢复和确认删除，不改写原文。|On-screen comments belong to individual videos. Legacy authors are unknown. Hide, restore or delete comments without rewriting them.
历史、章节收藏、打卡、播放进度和笔记元信息可在学习记录管理中按用户编号查询。|Look up visits, saved videos, check-ins, progress and note metadata by user ID in Learning records.
重置登录密码|Reset login password
重置后原密码和已有登录会话失效。请通过安全方式告知本人。|Resetting invalidates the old password and session. Notify the account owner securely.
新密码|New password
再次输入新密码|Repeat new password
确认重置密码|Reset password
确认重置此用户密码并退出其登录？|Reset this user's password and sign them out?
密码已重置，原登录已失效。|Password reset. The previous session is no longer valid.
本节讨论|Discussion for this video
请先选择章节|Choose a chapter first
正在加载本节讨论…|Loading this video's discussion…
本节还没有讨论，分享你的问题或想法吧。|No comments yet. Share a question or an idea.
所属课程|Course
所属章节|Chapter
全部章节|All chapters
历史课程评论（未绑定章节）|Legacy comments (no chapter assigned)
评论按章节视频展示。旧评论保留在历史课程评论中，不自动归入某一集。|Comments are grouped by video. Legacy comments remain unassigned.
搜索评论内容|Search comment text
保留并恢复显示|Keep and restore
已保留|Kept
查看对应视频|Open this video
★ 本节已加入书架|★ This video is saved
☆ 收藏本节视频|☆ Save this video
在收藏视频中查找|Find a saved video
视频、课程或讲师|Video, course or teacher
视频名称|Video title
个视频|videos
没有找到匹配视频|No matching videos
书架里还没有视频|No saved videos yet
在播放页收藏当前章节视频，下次可直接回到这一集。|Save the current video on its player page to return to this episode later.
查看收藏的章节视频|Revisit your saved videos
用户详情|User details
用户|User
注册日期|Joined
编辑资料|Edit profile
学习与互动概览|Learning and activity
私有笔记|Private notes
收藏视频|Saved videos
关注讲师|Followed teachers
最近访问课程|Recently visited courses
累计打卡天数|Total check-in days
发表讨论|Comments posted
统计包含已下架内容的保留记录。访问数量不是观看次数，打卡不代表学习时长。|Counts include retained records for unpublished courses. Visits are not video views; check-ins do not measure study time.
笔记库|Note library
仅显示笔记数量，私人笔记正文由用户本人查看和维护。|Only the note count is shown. Private notes are viewed and managed by their owner.
关注的讲师|Followed teachers
关注由用户产生，可在学习记录管理中清理；课程数量只计算已上架课程。|Users create follows; administrators can remove them in Learning records. Course counts include published courses only.
门已上架课程|published courses
尚未关注讲师|No followed teachers
头像维护|Avatar management
管理员请在个人中心修改自己的头像。|Administrators can change their own avatar in their profile.
选择图片后预览，确认保存才会替换此用户头像。|Preview an image, then confirm to replace this user's avatar.
选择头像图片|Choose an avatar image
支持 JPG、PNG、WebP，最大 4 MB；居中裁剪为正方形。|JPG, PNG or WebP, up to 4 MB. Images are cropped to a centered square.
新头像预览|New avatar preview
确认恢复该用户的默认头像？|Restore the default avatar for this user?
确认替换该用户的头像？|Replace this user's avatar?
打开用户详情，查看学习统计、关注讲师或维护头像。|Open user details to view learning statistics, followed teachers, or manage an avatar.
视频与章节|Videos and chapters
每个视频对应一个章节。先保存当前资料，再添加章节或上传视频。|Each video belongs to a chapter. Save these details before adding chapters or uploading videos.
保存并添加章节 / 上传视频|Save and add chapters / upload videos
保存并管理章节 / 上传视频|Save and manage chapters / upload videos
章节 / 上传视频|Chapters / upload videos
新增章节后即可上传 MP4 / WebM，也可为已有章节更换视频。|Add a chapter to upload MP4 / WebM, or replace an existing chapter's video.
新增章节并上传视频|Add a chapter and upload video
还没有章节，请先新增章节，再选择视频文件上传。|No chapters yet. Add a chapter, then choose a video to upload.
上传 / 更换视频|Upload / replace video
新增章节，下一步上传视频|Add a chapter, then upload video
编辑章节|Edit chapter
保存并上传视频|Save and upload video
文章管理|Articles
讨论审核|Comment moderation
操作审计|Audit log
新建文章|New article
学习随笔|Learning notes
管理文章|Managed articles
上架课程|Published courses
注册用户|Registered users
课程讨论|Course comments
课程与内容维护 · 需要管理员权限|Course and content management · Administrator access required
课程、文章和讨论的修改将保存到服务器。|Course, article and comment changes are saved on the server.
清除全部历史记录？|Clear all history?
将清除当前账号的课程访问记录，收藏、笔记和播放进度会保留。此操作无法撤销。|This clears your course visit history. Saved courses, notes and playback progress stay intact. This cannot be undone.
确认清除|Clear history
清除历史记录|Clear history
历史记录已清除|History cleared
较新的记录|Newer records
较早的记录|Older records
沿时间轴回顾，左右滑动查看更早的课程。|Follow your timeline. Scroll sideways to explore earlier courses.
课程访问时间轴|Course visit timeline
未记录时间|Time unavailable
时间轴显示北京时间，每门课程仅保留最近一次访问，不代表观看时长。|Beijing time. Only the latest visit per course is shown; this is not viewing duration.
与你关注的课程相关|Related to courses you follow
结合学习兴趣推荐|Selected for your learning interests
学习者正在关注|Popular with learners
发现新的学习方向|Explore a new learning direction
重温学过的课程|Revisit a course
每门课程保留最近一次访问；B站视频的播放进度由原站保存。|The latest visit is kept for each course; Bilibili manages video progress.
每天一点，按自己的节奏学习。|A little every day, at your own pace.
每天一点，慢慢积累|Small steps, day by day
留下今天的学习印记，按自己的节奏前进。|Mark today's effort and move at your own pace.
登录后打卡|Sign in to check in
今日打卡|Check in today
今日已打卡|Checked in today
正在保存…|Saving…
重新加载|Reload
登录后查看打卡日历，记录会随账号保存。|Sign in to view your calendar. Check-ins are saved to your account.
近 365 天|Past 365 days
天打卡|days checked in
连续打卡|Current streak
天|days
近一年打卡日历，可左右滚动|Check-in calendar for the past year. Scroll horizontally.
已打卡|Checked in
未打卡|No check-in
按北京时间每日打卡一次；只记录主动打卡，不代表观看时长或课程完成度。|One check-in per day in Beijing time. Check-ins do not measure viewing time or course completion.
暂时无法加载打卡记录，请重试。|Unable to load check-ins. Please try again.
今天的努力，已记下。|Today's effort is recorded.
历史记录|History
长文阅读|Long read
把问题说清楚，也是学习的一部分。阅读完整指南，了解如何准备、描述与追问。|Asking clearly is part of learning. Read the full guide to preparing, describing and following up on questions.
阅读全文 ↗|Read the full article ↗
文章目录|Contents
关闭文章 ×|Close article ×
全文完|End of article
回到文章开头 ↑|Back to the beginning ↑
查看历史记录 ↗|View history ↗
收藏感兴趣的课程，下次回来接着学。|Save courses you like and return when you are ready.
周一|Mon
周二|Tue
周三|Wed
周四|Thu
周五|Fri
周六|Sat
周日|Sun
一题一题，练好考研数学|Build your exam skills, one problem at a time
不必赶路，每一步都算数。|No need to rush. Every step counts.
重写一遍|Write it again
更换头像|Change avatar
我的头像|My avatar
当前头像|Current avatar
欢迎回到知途|Welcome back to Zhitu
在知途，开始新的学习|Start your next chapter
登录后，继续你的学习旅程。|Sign in and continue your learning journey.
创建一个账号，收藏你的下一门好课。|Create an account and find your next course.
登录或注册|Sign in or register
注册|Register
昵称|Nickname
密码|Password
请输入昵称|Enter your nickname
请输入密码|Enter your password
设置至少 6 位密码|Use at least 6 characters
确认密码|Confirm password
再次输入密码|Enter password again
显示|Show
隐藏|Hide
显示密码|Show password
隐藏密码|Hide password
两次输入的密码不一致|Passwords do not match
密码至少需要 6 位|Use at least 6 characters
注册并登录|Create account
正在处理…|Please wait…
已有账号？去登录|Already have an account? Sign in
没有账号？立即注册|New here? Create an account
收藏课程、记录笔记，让学习积累下来。|Save courses, take notes, and build on what you learn.
换一个喜欢的头像|Make this space yours
选择图片，拖动调整位置。|Choose an image and drag to adjust the crop.
头像裁剪预览|Avatar crop preview
选择图片|Choose image
支持 JPG、PNG、WebP，最大 4 MB|JPG, PNG or WebP, up to 4 MB
缩放|Zoom
水平位置|Horizontal position
垂直位置|Vertical position
恢复默认头像|Use default avatar
保存头像|Save avatar
头像已保存|Avatar saved
请选择不超过 4 MB 的 JPG、PNG 或 WebP 图片|Choose a JPG, PNG or WebP image up to 4 MB
图片尺寸过大，请选择较小的图片|Image dimensions are too large. Choose a smaller image.
请选择有效的头像图片|Choose a valid avatar image
学习小贴士|Study tips
每次选一个章节，给自己一个容易开始的目标。|Pick one lesson and make it easy to get started.
先尝试回忆，再打开笔记核对。|Try to recall what you learned before checking your notes.
学完写下一句话，留给下次复习。|Write one takeaway to revisit next time.
电路原理|Circuit theory
数量关系|Quantitative reasoning
公共课、计算机 408 与电路原理|Core exams, computer science and circuits
逻辑判断、言语理解与数量关系|Logic, verbal and quantitative reasoning
为你推荐|Selected for you
换一组|Refresh picks
推荐|Recommended
首页课程分类|Home course categories
精选课程|Featured courses
上一门精选课程|Previous featured course
下一门精选课程|Next featured course
切换精选课程|Choose a featured course
学习快捷入口|Learning shortcuts
学习是一条路，按照自己的节奏走。|Learning is a journey. Take it at your own pace.
全部课程 ↗|All courses ↗
去课程中心，发现更多好课|Find more in the course centre
找到你的学习方向|Find your learning direction
探索更多 ↗|Explore more ↗
值得一看的公开课|Open courses worth your time
编辑精选|Editor's picks
查看全部 ↗|View all ↗
学习经验 ↗|Study insights ↗
我的学习空间 ↗|My learning space ↗
登录，开启我的学习|Sign in to start learning
让每一次好奇，都有新的收获。|Turn curiosity into something new.
收藏感兴趣的课程，留下笔记，下次回来接着学。|Save a course, take notes, and pick up where you left off.
开始我的第一课 →|Start my first lesson →
先选一门好课，按自己的节奏学习。|Choose a course and learn at your own pace.
放下分心，从眼前的一课开始。|Set distractions aside and focus on one lesson.
打开人工智能的第一扇门|Your first step into AI
一步一步，打好数学基础|Build your maths foundation, step by step
从你的第一行代码开始|Start with your first line of code
节课程|lessons
门课程|courses
立即学习|Start learning
语文|Chinese literature
数学|Mathematics
物理|Physics
化学|Chemistry
地理|Geography
生物|Biology
政治|Politics
英语|English
408 专业课|Computer science 408
逻辑判断|Logical reasoning
言语理解|Verbal comprehension
数据库|Databases
编程|Programming
开发工具|Developer tools
数学方法 · 物理专题 · 化学生物|Mathematics · Physics · Chemistry and biology
数据结构 → 组成原理 → 操作系统 → 网络|Data structures → Architecture → OS → Networks
Harvard CS50 → Berkeley CS186|Harvard CS50 → Berkeley CS186
退出当前账号？|Sign out of this account?
课程展示方式|Course display
个人菜单|Account menu
留一段专注时间|Make time to focus
选一个时长，从眼前的一件事开始。|Choose a duration and focus on one thing.
专注时长|Focus duration
剩余时间|Time remaining
开始专注|Start focusing
暂停计时|Pause timer
继续计时|Resume timer
重新计时|Reset timer
再来一段|Start again
计时仅保存在当前标签页，不计入课程学习进度。|Saved in this tab only; does not count toward course progress.
正在计时，切换页面后仍会继续。|Timer running. It continues when you change pages.
这段专注已结束，起身休息一下吧。|Session complete. Time for a short break.
找到值得开始的一课|Find a good place to begin
选一个方向，或者先从下面的入门建议开始。|Explore a direction or try one of the starting points below.
从哪门课开始？|Where should I start?
按学习目的，找到第一步|Choose a purpose. Find your first step.
选择学习目的|Choose your learning purpose
高中巩固|School foundations
考研备考|Graduate exams
考公练习|Civil service practice
编程入门|Learn to code
先试看一节，再决定学习节奏|Try a lesson and find your pace
打开课程 ↗|Open course ↗
让第一课更轻松|Make the first lesson easier
课程之外，几个实用的小建议。|A few practical tips before you begin.
没有基础，怎样开始？|How do I start from scratch?
一门课太长，怎样安排？|How do I approach a long course?
遇到听不懂的地方怎么办？|What if I get stuck?
先梳理概念，再配合习题巩固。|Review the concepts, then reinforce them with exercises.
从运动学出发，建立物理分析方法。|Start with motion and develop your physics reasoning.
围绕高数重点题型，逐步补齐薄弱环节。|Work through calculus problems to strengthen weak areas.
先学数据结构，为计算机 408 打基础。|Build a foundation for CS exams with data structures.
先整理言语理解的方法，再做针对练习。|Learn verbal reasoning methods, then practise.
结合题目讲解，练习逻辑判断的思路。|Practise logical reasoning with worked examples.
用 Python 从第一个程序开始。|Write your first program with Python.
理解数据查询，动手练习 SQL。|Understand queries and practise SQL.
先看第一节，确认讲解节奏适合自己。编程课可以边看边运行示例；数学课先试做一道例题。|Try the first lesson. Run the examples in a coding class, or attempt one worked problem in maths.
一次只选一个章节。学完后写下一句总结，下一次从最近学习里继续。|Take one chapter at a time. Write a short summary, then return through your recent lessons.
暂停并记下问题，在课程页保存时间笔记。补充相关基础后，再回到这个章节复习。|Pause and save a timestamped note. Review the basics, then return to the chapter.
我的学习档案|My learning journal
整理笔记、回顾足迹，留一点时间给自己。|Collect your notes, revisit your interests, and make time for yourself.
我的笔记库|My notebook
导出笔记|Export notes
找回一个知识点，把零散记录串起来。|Reconnect your ideas and revisit what you learned.
搜索我的笔记|Search my notes
搜索笔记、课程或章节|Search notes, courses or chapters
按课程筛选笔记|Filter notes by course
笔记|Notes
最近探索的方向|Your recent interests
按访问课程统计|Based on courses opened
打开一门课程，开始留下你的学习足迹。|Open a course to start your learning journey.
登录后查看私有笔记|Sign in to view private notes
没有匹配的笔记|No matching notes
换一个关键词或课程试试。|Try another keyword or course.
已导出当前筛选的笔记|Exported the filtered notes
找回上次的章节，也为下一次学习留好位置。|Return to your last chapter and make room for what is next.
寻找下一门课 ↗|Find your next course ↗
接着上次学习 →|Continue your lesson →
复习我的笔记 ↗|Review my notes ↗
在我的课程中查找|Search my courses
课程、讲师或学科|Course, instructor or subject
学习方向|Learning direction
全部方向|All directions
排列方式|Sort by
最近添加或访问|Recently added or opened
重置筛选|Reset filters
找到|Found
门课程|courses
移出书架|Remove from shelf
加入书架|Add to shelf
已移出书架|Removed from shelf
已加入书架|Added to shelf
发现课程 →|Discover courses →
从感兴趣的一门课开始，学习记录会保存在这里。|Start a course you like. Your learning history will appear here.
这里记录最近打开的章节；B站视频的播放进度由原站保存。|This page remembers opened chapters. Bilibili saves video playback progress.
学习经验，换个思路|A fresh perspective on learning
从一个方法开始尝试。新增文章含英文短摘录与中文对照，保留原文来源。|Try one method. New articles include brief English excerpts, Chinese translations and source links.
笔记整理|Note-taking
中英对照|English & Chinese
阅读对照 ↗|Read bilingual excerpt ↗
原文摘录 · 中英对照|Original excerpt · English & Chinese
英文原文|Original English
中文译文 · 本站译|Chinese translation · By this site
阅读完整原文 ↗|Read the full original ↗
学习要点|Study takeaways
试着这样做|Try it yourself
本站实践建议|Practice suggestion from this site
英文为原文短摘录；中文译文、要点与实践建议由本站整理。|Brief English quotation. Chinese translation, summaries and practice suggestions prepared by this site.
阅读文章 ↗|Read article ↗
阅读方法要点与英文短摘录，结合具体任务试一试。|Read practical takeaways and short English excerpts, then try a learning task.
公开文章精选|Selected public articles
阅读中文要点，或前往原文深入了解。以下为来源文章整理。|Read the Chinese summaries or visit the original articles.
学习经验分类|Study article topics
学习方法|Study methods
复习安排|Review planning
备考经验|Exam experiences
阅读要点 ↗|Read summary ↗
关闭文章|Close article
原文与来源|Original article and source
中文要点由本站整理，原文为英文。|Chinese summary prepared for this site. Original article in English.
个人中心|My profile
知识奶酪头像|Cheese learner avatar
欢迎回到你的学习空间|Welcome to your learning space
登录后保存学习记录|Sign in to keep your learning together
查看头像|View avatar
关闭|Close
加入知途|Joined Zhitu
关注讲师|Following
接着上次继续|Pick up where you left off
全部记录 →|All activity →
从一门好课开始|Start with a good course
打开课程后，这里会记住你的最近章节。|Open a course to remember your last lesson here.
登录后，这里会展示你的学习记录。|Sign in to see your recent learning here.
浏览课程 →|Browse courses →
最近的灵感|Recent ideas
私有学习笔记|Private study notes
回到对应章节 ↗|Return to the lesson ↗
把灵感留下来|Keep a little inspiration
在课程详情页保存笔记，随时回来复习。|Save notes on a course page and revisit them here.
找一门课程 →|Find a course →
我的学习目标|My learning goal
给下一次学习，一个小小的方向。|A little direction for your next learning session.
下一步想完成什么？|What would you like to do next?
例如：复习一节线性代数|For example: review a linear algebra lesson
这个目标已完成|I have completed this goal
保存目标|Save goal
仅保存在当前浏览器，按账号分别记录。|Saved in this browser, separately for each account.
登录后可记录自己的学习目标。|Sign in to keep your own learning goal.
关注的讲师|Teachers you follow
在课程页关注讲师，方便下次找到。|Follow a teacher on their course page to find them here.
知识就是力量，也可以很可爱。|Knowledge is power. And a little joy.
目标已完成，给自己一点鼓励。|Goal complete. Give yourself a little credit.
目标已保存，下一步慢慢来。|Goal saved. One step at a time.
无法保存目标，请检查浏览器存储设置。|Could not save the goal. Check your browser storage settings.
请写下一个学习目标|Please enter a learning goal
大学与技术公开课|University & tech
编程、人工智能与大学基础课程|Programming, AI and university foundations
人工智能|Artificial intelligence
操作系统|Operating systems
主导航|Main navigation
导航样式|Navigation style
柔和渐变|Soft gradient
简洁纯色|Solid color
首页|Home
课程|Courses
学习|Learning
发现|Explore
我的|Me
我的学习|My learning
我的书架|My bookshelf
学习空间|Learning space
搜索课程、讲师、知识点|Search courses or teachers
搜索|Search
界面设置|Appearance
语言与阅读偏好|Make this space yours
界面语言|Interface language
课程原名、评论和笔记保留原文。|Course titles, comments and notes stay in their original language.
阅读字号|Reading size
标准|Standard
舒适|Comfort
柔和背景|Soft background
淡粉与浅紫的柔和渐变。|A soft blush and lavender gradient.
背景视差|Background motion
滚动时让背景缓慢移动。|Let the landscape move gently as you scroll.
系统已开启减少动态效果，背景保持静止。|Your system prefers reduced motion. The landscape stays still.
恢复默认外观|Reset appearance
完成|Done
关闭设置|Close settings
你的偏好已保存在此浏览器。|Preferences are saved in this browser.
无法保存偏好，当前设置仅在本次访问有效。|Storage is unavailable. These settings last for this visit.
知途 · 每天向前一点|A LITTLE PROGRESS, EVERY DAY
把时间留给|Make time for
真正想学的事。|what inspires you.
在安静、有序的学习空间里，找到课程，留下思考，|Find your next course. Keep your ideas close.
让每一个小小的进步，都有迹可循。|Give every small step a place to grow.
探索课程　↗|Explore courses ↗
回到我的学习 →|My learning →
系统课程|Curated courses
时间笔记|Timestamped notes
专注学习|Focused learning
本期学习精选|THIS WEEK'S PICK
让复杂|Make complexity
变得清晰|feel clear
值得投入的好课|Worth your curiosity
浏览全部课程 ↗|All courses ↗
下一次，一起学习|Learn together, next time
给学习一个方向|Find your direction
按目标找到课程，再按自己的节奏前进|Choose a goal. Find a course. Set your own pace.
高中理科打基础|Build a science foundation
计算机 408 系统复习|Computer science foundations
从 SQL 到数据库系统|From SQL to databases
查看路线课程 ↗|Explore this path ↗
学习是一条路，按照自己的节奏走。|Learning is a journey. Make it your own.
我的课程书架 ↗|My bookshelf ↗
接着上次，继续出发|PICK UP WHERE YOU LEFT OFF
继续学习 →|Continue learning →
继续学习|Continue learning
沿着兴趣，找到下一段旅程|Follow your curiosity
搜索学科、课程、讲师或知识点|Search subjects, courses or teachers
搜索课程|Search courses
课程排序|Sort courses
排序|Sort
默认顺序|Default order
分集最多|Most lessons
课程名称|Course title
全部|All
全部学科|All subjects
学科|Subject
高中课程|High school
考研课程|Graduate entrance
考公课程|Civil service
计算机课程|Computing
海外公开课|Open courses
没有找到匹配课程|No courses found
试试其他关键词，或切换课程分类。|Try another keyword or category.
清除筛选|Clear filters
卡片视图|Card view
清单视图|List view
返回首页|Home
返回课程列表|Course catalog
← 返回上一页|← Back
← 返回课程列表|← Course catalog
← 返回首页|← Home
返回顶部|Back to top
顶部|Top
加载中…|Loading…
登录知途课堂|Welcome to Zhitu
登录后同步学习进度、收藏和互动记录|Sign in to keep your learning, bookmarks and notes together.
昵称（演示账号：林同学）|Nickname (demo: 林同学)
密码（演示密码：123456）|Password (demo: 123456)
登录|Sign in
没有账号？立即注册|New here? Create an account
我的收藏|My favorites
探索更多课程 ↗|Explore more courses ↗
最近打开的课程|Recently opened
书架收藏|Saved courses
可探索的课程|Courses to explore
最近学习|Recent learning
B站课程记录最近打开的章节，实际播放时间由原站管理。|For Bilibili courses, we remember the last opened lesson. Playback time stays on Bilibili.
书架里还没有课程|Your bookshelf is waiting
暂无学习记录|Start your learning journey
把感兴趣的课程加入书架，方便下次找到。|Save a course that interests you and find it here next time.
打开感兴趣的课程后，这里会记住你最近查看的章节。|Open a course and we will remember the lesson you last visited.
浏览课程|Browse courses
从这些课程开始|A few places to start
发现下一种可能|Discover what's next
从一个好奇的问题，开始今天的学习。|Let a little curiosity lead the way.
知途课程图书馆|THE ZHITU LIBRARY
高中 · 考研 · 编程 · 世界公开课|School · Exams · Coding · Open courses
按方向探索|Explore by direction
全部课程 →|All courses →
进入分类 ↗|Explore category ↗
你的学习工具|Your learning toolkit
课程书架|Bookshelf
留住想学的内容 →|Save what inspires you →
查看最新安排 →|See upcoming sessions →
我的学习空间|Your learning space
积累一点点，让每次出发都有迹可循。|Small steps, thoughtfully kept.
你好，学习者|Hello, learner
欢迎回来，今天也按自己的节奏学习。|Welcome back. Learn at your own pace.
登录后同步课程书架、章节记录和笔记。|Sign in to sync your bookshelf, lessons and notes.
退出登录|Sign out
登录 / 注册|Sign in / Register
最近访问|Recently opened
可探索课程|Courses to explore
学习服务|Learning essentials
让学习井然有序|A little order for your curiosity
回到上次打开的章节|Pick up from your last lesson
查看收藏的课程|Revisit your saved courses
学习方向|Learning paths
为下一段旅程找到目标|Choose where to go next
管理工作台|Admin workspace
课堂展示 · 管理端交互原型|Classroom demo · Admin prototype (Chinese)
课程中心|Course catalog
进入专注模式|Focus mode
退出专注模式|Exit focus mode
← 上一节|← Previous
下一节 →|Next →
自动下一节|Auto-play next
学习目录|Lessons
搜索章节标题或序号|Find a lesson by title or number
搜索章节|Search lessons
课程章节尚未发布|Lessons have not been published yet
一次专注，一点进步。|One focused moment. One small step.
★ 已加入书架|★ Saved to bookshelf
☆ 加入书架|☆ Save to bookshelf
已关注讲师|Following teacher
＋ 关注讲师|＋ Follow teacher
分享这门课|Share course
在来源站打开 ↗|Open original source ↗
关于这门课|About this course
学习讨论|Discussion
讨论内容|Discussion text
写下你的问题，或分享一个新发现|Ask a question or share a discovery
发布|Post
学习记录|Learning record
原站记录|On source site
嵌入播放器不提供进度回传，可在此保存笔记和收藏。|The embedded player does not share playback progress. You can still save notes and courses here.
我的时间笔记|My timestamped notes
记录此刻的灵感，复习时一键返回。|Capture an idea and return to it later.
视频时间（秒，手动填写）|Video time (seconds, enter manually)
这一节，我学到了……|In this lesson, I learned…
学习笔记|Study notes
保存时间笔记|Save note
还没有笔记，从一个要点开始。|No notes yet. Start with one idea.
登录后可保存自己的学习笔记。|Sign in to save your study notes.
删除|Delete
删除这条笔记|Delete this note
B站不向本页提供播放时间，请手动填写时间点。|Bilibili does not share playback time. Enter the timestamp manually.
已记住本节 · 播放进度由B站管理|Lesson saved · Playback managed by Bilibili
登录后可记住章节 · 播放进度由B站管理|Sign in to remember lessons · Playback managed by Bilibili
章节记录未保存，请重试|Lesson was not saved. Please try again.
保存当前播放时间，点击笔记可返回对应位置。|Save the current time. Select a note to revisit that moment.
游客可播放，登录后同步进度|Watch as a guest; sign in to sync progress
加载视频后自动保存进度|Progress saves automatically after loading
按各章节已播放位置计算；拖动到后面也会更新进度|Calculated from each lesson's furthest playback position, including seeking.
课程链接已复制|Course link copied
请复制选中的课程链接|Copy the selected course link
笔记已保存|Note saved
讨论已发布|Discussion posted
浏览全部课程|Browse all courses
打开课程|Open course
最近搜索|Recent searches
搜索建议|Search suggestions
课程提示|Course suggestions
清空历史|Clear history
清空搜索|Clear search
搜索关键词|Search keyword
清除关键词 ×|Clear keyword ×
搜索历史仅保存在当前浏览器|Search history stays in this browser
输入课程、讲师或学科开始搜索|Search by course, teacher or subject
正在查找课程…|Finding courses…
查看全部搜索结果|View all results
没有找到匹配课程，试试其他关键词|No matching courses. Try another keyword.
暂时无法加载提示，仍可回车搜索|Suggestions unavailable. Press Enter to search.
已预约|Reserved
预约|Reserve
已开始|Started
预约已保存|Reservation saved
↶ 10秒|↶ 10 sec
10秒 ↷|10 sec ↷
倍速|Speed
画中画|Picture in picture
弹幕|Live comments
发送课堂弹幕|Write a live comment
发送|Send
重试|Try again
⏵ 点击播放|⏵ Play
六大学科，基础与高考复习|Six subjects, from foundations to exam revision
公共课与计算机 408|Core subjects and computer science
逻辑判断与言语理解|Logical reasoning and verbal comprehension
Python 与 C++ 入门进阶|Python and C++, from basics to practice
数学、数据库与开发工具|Mathematics, databases and developer tools
`
    .trim()
    .split('\n')
    .map((line) => line.split('|')),
);
let language = 'zh-CN';
const originalText = new WeakMap(),
  originalAttrs = new WeakMap();
export function uiText(value) {
  if (language !== 'en') return value;
  const raw = String(value),
    key = raw.trim();
  let translated = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (!translated) {
    const patterns = [
      [/^(\d+) 节课程$/, (m, n) => n + ' lessons'],
      [/^(\d+) 门课程 · ([\d,]+) 个分集$/, (m, n, l) => n + ' courses · ' + l + ' lessons'],
      [/^(.+) · (\d+) 节$/, (m, t, n) => t + ' · ' + n + ' lessons'],
      [/^(\d+) 门 · (.+)$/, (m, n, d) => n + ' courses · ' + uiText(d)],
      [/^(\d+) 节 · (.+)$/, (m, n, d) => n + ' lessons · ' + uiText(d)],
      [/^上次打开：(.*)$/, (m, t) => 'Last opened: ' + t],
      [/^(.+)，从上次停下的地方继续。$/, (m, n) => n + ', pick up where you left off.'],
      [/^欢迎，(.+)$/, (m, n) => 'Welcome, ' + n],
      [/^(0[123]) \/ 学习路线$/, (m, n) => n + ' / LEARNING PATH'],
      [/^找到 (\d+) 门课程(.*)$/, (m, n, tail) => n + ' courses found' + tail],
      [
        /^(\d+) 门真实课程 · ([\d,]+) 个分集 · 从高中基础到大学公开课$/,
        (m, n, l) => n + ' real courses · ' + l + ' lessons · From school to open courses',
      ],
      [/^(\d+) 门好课，随时出发$/, (m, n) => n + ' courses. Your next chapter.'],
      [/^(\d+) 门课程$/, (m, n) => n + ' courses'],
      [/^(\d+) 节$/, (m, n) => n + ' lessons'],
      [/^匹配 (\d+) 节$/, (m, n) => n + ' matching lessons'],
    ];
    for (const [pattern, replace] of patterns)
      if (pattern.test(key)) {
        translated = key.replace(pattern, replace);
        break;
      }
  }
  return translated ? raw.replace(key, translated) : value;
}
export function setupExperience() {
  let preferences = {
    language: 'zh-CN',
    reading: 'standard',
    landscape: true,
    parallax: true,
    view: 'cards',
    navigation: 'gradient',
  };
  try {
    const p = JSON.parse(localStorage.getItem('zhitu-appearance') || 'null');
    if (p)
      preferences = {
        language: p.language === 'en' ? 'en' : 'zh-CN',
        reading: p.reading === 'comfort' ? 'comfort' : 'standard',
        landscape: p.landscape !== false,
        parallax: p.parallax !== false,
        view: p.view === 'list' ? 'list' : 'cards',
        navigation: p.navigation === 'solid' ? 'solid' : 'gradient',
      };
  } catch {}
  const dialog = document.createElement('dialog');
  dialog.id = 'appearance-dialog';
  dialog.innerHTML =
    '<div class="appearance-heading"><div><span class="kicker">A SPACE FOR YOU</span><h2>界面设置</h2><p>语言与阅读偏好</p></div><button id="appearance-close" type="button" aria-label="关闭设置">×</button></div><label class="preference-row"><span><b>界面语言</b><small>课程原名、评论和笔记保留原文。</small></span><select id="interface-language" aria-label="界面语言"><option value="zh-CN">简体中文</option><option value="en">English</option></select></label><label class="preference-row"><span><b>导航样式</b></span><select id="navigation-style" aria-label="导航样式"><option value="gradient">柔和渐变</option><option value="solid">简洁纯色</option></select></label><label class="preference-row"><span><b>阅读字号</b></span><select id="reading-size" aria-label="阅读字号"><option value="standard">标准</option><option value="comfort">舒适</option></select></label><label class="preference-row"><span><b>柔和背景</b><small>淡粉与浅紫的柔和渐变。</small></span><input id="landscape-toggle" type="checkbox" role="switch"></label><label class="preference-row"><span><b>背景视差</b><small>滚动时让背景缓慢移动。</small></span><input id="parallax-toggle" type="checkbox" role="switch"></label><p id="reduced-motion-note" class="helper" hidden>系统已开启减少动态效果，背景保持静止。</p><p id="preferences-saved" class="helper" role="status">你的偏好已保存在此浏览器。</p><div class="appearance-actions"><button id="appearance-reset" type="button">恢复默认外观</button><button id="appearance-done" type="button" class="main-button">完成</button></div>';
  document.body.append(dialog);
  const preferenceMenus = [...dialog.querySelectorAll('select')].map(enhanceSelect);
  dialog.addEventListener('close', () => preferenceMenus.forEach((menu) => menu.close()));
  const ignore =
    '.logo,.admin-shell,.admin-dialog,.card h3,.cover,.chapter-list,.comment,.note p,.note-time,.danmaku-layer,.video-meta h1,.video-meta p,.description p,.profile-avatar,.profile-card h2,#source-info,#account,[data-original-content],script,style,textarea';
  const observer = new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(() => {
        queued = false;
        translate();
      });
    }
  });
  let queued = false;
  const observe = () =>
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });
  function translate() {
    observer.disconnect();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      if (!node.parentElement || node.parentElement.closest(ignore)) continue;
      let record = originalText.get(node);
      if (!record || node.nodeValue !== record.last) record = { source: node.nodeValue };
      const next = uiText(record.source);
      if (next !== node.nodeValue) node.nodeValue = next;
      record.last = next;
      originalText.set(node, record);
    }
    document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      if (el.closest('.admin-shell,.admin-dialog,[data-original-content]')) return;
      let records = originalAttrs.get(el) || {};
      for (const attr of ['placeholder', 'title', 'aria-label'])
        if (el.hasAttribute(attr)) {
          const value = el.getAttribute(attr);
          let rec = records[attr];
          if (!rec || rec.last !== value) rec = { source: value };
          rec.last = uiText(rec.source);
          if (rec.last !== value) el.setAttribute(attr, rec.last);
          records[attr] = rec;
        }
      originalAttrs.set(el, records);
    });
    document.documentElement.lang = language;
    document.querySelector('#app').lang = document.body.classList.contains('admin-mode')
      ? 'zh-CN'
      : language;
    document.title = language === 'en' ? 'Zhitu · A space to learn' : '知途课堂 · 按自己的节奏学习';
    observe();
  }
  function apply(save = false) {
    language = preferences.language;
    document.body.classList.toggle('solid-navigation', preferences.navigation === 'solid');
    dialog.querySelector('#navigation-style').value = preferences.navigation;
    document.body.classList.toggle('reading-comfort', preferences.reading === 'comfort');
    document.body.classList.toggle('plain-background', !preferences.landscape);
    document.body.classList.toggle('still-background', !preferences.parallax);
    document.body.classList.toggle('catalog-list-view', preferences.view === 'list');
    dialog.querySelector('#interface-language').value = language;
    dialog.querySelector('#reading-size').value = preferences.reading;
    dialog.querySelector('#landscape-toggle').checked = preferences.landscape;
    dialog.querySelector('#parallax-toggle').checked = preferences.parallax;
    dialog.querySelector('#parallax-toggle').disabled = !preferences.landscape;
    document
      .querySelectorAll('[data-course-view]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.courseView === preferences.view)),
      );
    if (save) {
      try {
        localStorage.setItem('zhitu-appearance', JSON.stringify(preferences));
        dialog.querySelector('#preferences-saved').textContent = '你的偏好已保存在此浏览器。';
      } catch {
        dialog.querySelector('#preferences-saved').textContent =
          '无法保存偏好，当前设置仅在本次访问有效。';
      }
    }
    translate();
    preferenceMenus.forEach((menu) => menu.sync());
  }
  const open = () => {
    preferenceMenus.forEach((menu) => menu.close());
    apply();
    dialog.showModal();
  };
  document.querySelector('#appearance-button').onclick = open;
  dialog.querySelector('#appearance-close').onclick = dialog.querySelector(
    '#appearance-done',
  ).onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.querySelector('#interface-language').onchange = (e) => {
    preferences.language = e.target.value;
    apply(true);
  };
  dialog.querySelector('#navigation-style').onchange = (e) => {
    preferences.navigation = e.target.value;
    apply(true);
  };
  dialog.querySelector('#reading-size').onchange = (e) => {
    preferences.reading = e.target.value;
    apply(true);
  };
  dialog.querySelector('#landscape-toggle').onchange = (e) => {
    preferences.landscape = e.target.checked;
    apply(true);
  };
  dialog.querySelector('#parallax-toggle').onchange = (e) => {
    preferences.parallax = e.target.checked;
    apply(true);
  };
  dialog.querySelector('#appearance-reset').onclick = () => {
    preferences = {
      ...preferences,
      reading: 'standard',
      landscape: true,
      parallax: true,
      view: 'cards',
      navigation: 'gradient',
    };
    apply(true);
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-course-view]');
    if (button) {
      preferences.view = button.dataset.courseView;
      apply(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.isComposing &&
      !event.target.closest('input,textarea,select,[contenteditable="true"]') &&
      !document.querySelector('dialog[open]') &&
      !document.body.classList.contains('admin-mode')
    ) {
      event.preventDefault();
      document.querySelector('#search').focus();
    }
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const reflectReduced = () =>
    (dialog.querySelector('#reduced-motion-note').hidden = !reduced.matches);
  reduced.addEventListener('change', reflectReduced);
  reflectReduced();
  apply();
  return {
    refresh() {
      apply();
    },
  };
}
