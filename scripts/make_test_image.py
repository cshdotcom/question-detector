"""生成一张测试用的"试卷"图片，里面包含 5 道题，用于自检。"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1400
img = Image.new("RGB", (W, H), color="white")
draw = ImageDraw.Draw(img)

try:
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 48)
    font_body = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 32)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 26)
except Exception:
    font_title = font_body = font_small = ImageFont.load_default()

draw.text((80, 80), "数学练习卷", fill="black", font=font_title)
draw.text((80, 160), "姓名：________  班级：________", fill="black", font=font_small)

draw.text((80, 260), "1. 计算 23 + 45 = ?", fill="black", font=font_body)
draw.text((80, 360), "2. 下列哪个是偶数？", fill="black", font=font_body)
draw.text((120, 420), "A. 3        B. 5        C. 8        D. 9", fill="black", font=font_small)
draw.text((80, 540), "3. 一辆汽车以 60 km/h 的速度行驶 3 小时，", fill="black", font=font_body)
draw.text((80, 590), "   请问它行驶了多少公里？", fill="black", font=font_body)
draw.text((80, 650), "   解：", fill="black", font=font_small)
draw.text((80, 800), "4. 简述光合作用的过程。", fill="black", font=font_body)
draw.text((120, 870), "答：_______________________________________", fill="black", font=font_small)
draw.text((120, 910), "___________________________________________", fill="black", font=font_small)
draw.text((120, 950), "___________________________________________", fill="black", font=font_small)
draw.text((80, 1050), "5. 解方程 2x + 5 = 15", fill="black", font=font_body)

img.save("/tmp/test-images/test_paper.jpg", quality=90)
print("Created /tmp/test-images/test_paper.jpg")
