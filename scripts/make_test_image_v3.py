"""生成测试图片：含数学公式 + 阅读理解"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1600
img = Image.new("RGB", (W, H), color="white")
draw = ImageDraw.Draw(img)

try:
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 48)
    font_body = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 30)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 26)
    font_math = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
except Exception:
    font_title = font_body = font_small = font_math = ImageFont.load_default()

draw.text((80, 60), "数学练习卷", fill="black", font=font_title)

# 题目 1：含公式
draw.text((80, 180), "1. 解方程：x² - 5x + 6 = 0", fill="black", font=font_body)

# 题目 2：含分式
draw.text((80, 280), "2. 计算 ∫(2x + 3)dx", fill="black", font=font_body)
draw.text((120, 340), "(请写出原函数)", fill="black", font=font_small)

# 题目 3：阅读理解 - 文章
draw.text((80, 450), "3. 阅读下面短文，回答问题。", fill="black", font=font_body)
draw.text((80, 520), "Tom is a 12-year-old boy who lives in a small town.", fill="black", font=font_small)
draw.text((80, 560), "He loves playing basketball with his friends every", fill="black", font=font_small)
draw.text((80, 600), "weekend. His dream is to become a professional", fill="black", font=font_small)
draw.text((80, 640), "basketball player when he grows up.", fill="black", font=font_small)
draw.text((80, 680), "His mother supports him and takes him to practice.", fill="black", font=font_small)
draw.text((80, 720), "Tom practices for two hours every day after school.", fill="black", font=font_small)
draw.text((80, 760), "He believes hard work can make dreams come true.", fill="black", font=font_small)

# 阅读理解的题目
draw.text((80, 850), "(1) How old is Tom?", fill="black", font=font_body)
draw.text((80, 920), "(2) What is Tom's dream?", fill="black", font=font_body)
draw.text((80, 990), "(3) Does Tom's mother support him?", fill="black", font=font_body)

# 题目 4：几何
draw.text((80, 1100), "4. 如图所示，求三角形面积。", fill="black", font=font_body)
# 画一个三角形
draw.polygon([(500, 1180), (300, 1300), (700, 1300)], outline="black", fill="#f0f0f0")
draw.text((490, 1320), "底=8, 高=6", fill="black", font=font_small)

# 题目 5
draw.text((80, 1400), "5. 简述勾股定理。", fill="black", font=font_body)

img.save("/tmp/test-images/test_paper_v3.jpg", quality=90)
print("Created /tmp/test-images/test_paper_v3.jpg")
