import { readFileSync } from 'node:fs';
import { CourseSchema, courseJsonSchema, parsePageSelection, selectedPages } from '@formazione/contracts';
const sample = () => JSON.parse(readFileSync(new URL('../fixtures/sample-course.json', import.meta.url), 'utf8'));

describe('course contracts', () => {
  it('accepts the published fixture and exports structural JSON Schema', () => {
    expect(CourseSchema.parse(sample()).modules).toHaveLength(2);
    expect(courseJsonSchema.type).toBe('object');
  });
  it.each([
    (c: any) => c.modules.push(c.modules[0]),
    (c: any) => c.modules[0].lessons[0].slides[0].sourceRefs = [],
    (c: any) => c.modules[0].lessons[0].slides[0].sourceRefs = ['missing'],
    (c: any) => c.questions[0].correctOptionId = 'missing',
    (c: any) => c.questions[0].options[1].id = c.questions[0].options[0].id,
    (c: any) => c.questions[0].lessonId = 'lesson-2',
    (c: any) => c.questions[0].sourceRefs = [],
    (c: any) => c.modules[0].exam.questionIds = ['question-2'],
    (c: any) => c.modules[0].exam.passingScore = 2,
    (c: any) => c.modules[0].lessons = [],
    (c: any) => c.modules[0].lessons[0].questionIds = [],
  ])('rejects broken references and incomplete content %#', mutate => {
    const course = sample(); mutate(course);
    expect(CourseSchema.safeParse(course).success).toBe(false);
  });
});

describe('original PDF page selection', () => {
  it('selects 201 through 300 inclusively from 1000 pages', () => {
    const selection = parsePageSelection({ mode: 'range', fromPage: '201', toPage: '300' }, 1000);
    const pages = selectedPages(selection, 1000);
    expect(pages).toHaveLength(100); expect(pages[0]).toBe(201); expect(pages.at(-1)).toBe(300);
  });
  it('selects the whole volume', () => expect(selectedPages(parsePageSelection({ mode: 'all' }, 3), 3)).toEqual([1, 2, 3]));
  it.each(['2abc', '1.5', '0', '-1', ' 2', '2e2', '9007199254740992'])('rejects ambiguous page %s', from => {
    expect(() => parsePageSelection({ mode: 'range', fromPage: from, toPage: '300' }, 1000)).toThrow();
  });
  it('rejects reversed and excessive ranges', () => {
    expect(() => parsePageSelection({ mode: 'range', fromPage: '301', toPage: '300' }, 1000)).toThrow();
    expect(() => parsePageSelection({ mode: 'range', fromPage: '1', toPage: '1001' }, 1000)).toThrow();
  });
});
